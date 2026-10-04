/**
 * HTTP app (Hono): POST /mcp (MCP Streamable HTTP, stateless JSON responses), GET /healthz and
 * the product pages. Per-client rate limit in memory, 2 MB body limit, security headers on pages,
 * CORS on /mcp as the transport requires. Logs never include inputs or IP addresses: only known
 * routes, MCP method names and tool names are logged; anything else is logged as "other".
 */
import { isIP } from "node:net";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CONFIG, SERVICE } from "./config.js";
import { log } from "./log.js";
import { buildServer, TOOL_TEXT } from "./mcp.js";
import { loadSite, type SiteFile } from "./site.js";

export interface AppOptions { rateLimitPerMin?: number; trustedProxyHops?: number; rateLimitMaxKeys?: number; site?: Map<string, SiteFile> }

const rpcError = (code: number, message: string) => ({ jsonrpc: "2.0", error: { code, message }, id: null });

export const PAGE_HEADERS: Record<string, string> = {
  "Content-Security-Policy": "default-src 'none'; style-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

/** MCP methods logged by name; any other method string is logged as "other" (it is client-chosen text). */
const MCP_METHODS = new Set([
  "initialize", "ping", "tools/list", "tools/call", "resources/list", "resources/read", "resources/templates/list", "resources/subscribe",
  "resources/unsubscribe", "prompts/list", "prompts/get", "completion/complete", "logging/setLevel", "notifications/initialized",
  "notifications/cancelled", "notifications/progress", "notifications/roots/list_changed",
]);
export const logRpc = (method: unknown, tool: unknown): { rpc: string; tool?: string } => {
  const rpc = typeof method === "string" && MCP_METHODS.has(method) ? method : "other";
  if (rpc !== "tools/call") return { rpc };
  return { rpc, tool: typeof tool === "string" && Object.hasOwn(TOOL_TEXT, tool) ? tool : "other" };
};

/** IPv6 addresses are grouped by their /64 (one subscriber usually holds a whole /64); IPv4-mapped IPv6 is read as IPv4. */
function ipv6Prefix(ip: string): string {
  const lower = ip.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped && isIP(mapped[1]) === 4) return mapped[1];
  const [head, tail] = lower.includes("::") ? lower.split("::") : [lower, undefined];
  const groups = (part: string | undefined) => (part ? part.split(":").flatMap((g) => (g.includes(".") ? ["0", "0"] : [g])) : []);
  const h = groups(head), t = groups(tail);
  const all = tail === undefined ? h : [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return `${all.slice(0, 4).map((g) => parseInt(g || "0", 16).toString(16)).join(":")}::/64`;
}

/** A rate-limit key from one address entry ("1.2.3.4", "1.2.3.4:5678", "[2001:db8::1]:443", "fe80::1%eth0"), or null if it is not an IP. */
export function rateKey(entry: string | undefined): string | null {
  let s = (entry ?? "").trim();
  if (s.startsWith("[")) { const end = s.indexOf("]"); if (end < 0) return null; s = s.slice(1, end); }
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(s)) s = s.slice(0, s.lastIndexOf(":"));
  s = s.replace(/%.*$/, "");
  const v = isIP(s);
  return v === 4 ? s : v === 6 ? ipv6Prefix(s) : null;
}

/**
 * Client key for rate limiting only (never logged). Each trusted proxy appends one X-Forwarded-For
 * entry, so the client is the entry `hops` places from the right; entries further left were sent by
 * the client and are ignored. With fewer entries than hops (a request that skipped a proxy), the
 * leftmost entry is used. Falls back to the socket address.
 */
export function clientKey(xff: string | undefined, remote: string | undefined, hops: number): string {
  if (xff) {
    const parts = xff.split(",").map((x) => x.trim()).filter(Boolean);
    const key = parts.length ? rateKey(parts[Math.max(0, parts.length - Math.max(1, hops))]) : null;
    if (key) return key;
  }
  return rateKey(remote) ?? "unknown";
}
export function clientIp(c: Context, hops: number): string {
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return clientKey(c.req.header("x-forwarded-for"), env?.incoming?.socket?.remoteAddress, hops);
}

/**
 * Sliding-window rate limit per key, in memory: the previous minute's count weighted by how much of
 * it still overlaps the window, plus this minute's count. Memory is bounded: at most maxKeys keys,
 * the least recently seen evicted first, and idle keys swept on a timer rather than per request.
 */
export class RateLimiter {
  private readonly keys = new Map<string, { start: number; prev: number; curr: number; last: number }>();
  constructor(readonly limit: number, readonly maxKeys = 10_000, readonly windowMs = 60_000) {}
  get size(): number { return this.keys.size; }
  /** Count one request at `now`; returns 0 when allowed, otherwise the seconds to wait. */
  hit(key: string, now: number): number {
    const W = this.windowMs;
    let e = this.keys.get(key);
    if (e) this.keys.delete(key); // re-inserted below, so Map order is least recently seen first
    else {
      if (this.keys.size >= this.maxKeys) {
        // Evict the least recently seen tenth in one pass (one pass per batch keeps eviction O(1) per request on average).
        let n = Math.max(1, Math.ceil(this.maxKeys / 10));
        for (const k of this.keys.keys()) { this.keys.delete(k); if (--n <= 0) break; }
      }
      e = { start: now, prev: 0, curr: 0, last: now };
    }
    if (now - e.start >= 2 * W) { e.start = now; e.prev = 0; e.curr = 0; }
    else if (now - e.start >= W) { e.start += W; e.prev = e.curr; e.curr = 0; }
    e.last = now;
    this.keys.set(key, e);
    const into = now - e.start;
    if (e.prev * (1 - into / W) + e.curr < this.limit) { e.curr++; return 0; }
    // When the estimate drops below the limit, assuming no more requests.
    const waitMs = e.curr >= this.limit ? e.start + W - now + W * (1 - this.limit / e.curr) : e.start + W * (1 - (this.limit - e.curr) / e.prev) - now;
    return Math.max(1, Math.ceil(waitMs / 1000));
  }
  /** Drop keys not seen for two windows. Cost is proportional to the keys dropped. */
  sweep(now: number): void {
    for (const [k, e] of this.keys) { if (now - e.last < 2 * this.windowMs) break; this.keys.delete(k); }
  }
}

export function createApp(opts: AppOptions = {}) {
  const limit = opts.rateLimitPerMin ?? CONFIG.rateLimitPerMin;
  const hops = opts.trustedProxyHops ?? CONFIG.trustedProxyHops;
  const site = opts.site ?? loadSite();
  const app = new Hono();

  // Access log: method, path, status, latency, and for MCP the JSON-RPC method and tool name only.
  // Paths outside the known routes are client-chosen text, so they are logged as "other".
  const knownPath = (p: string) => (p === "/mcp" || p === "/healthz" || site.has(p) ? p : "other");
  app.use("*", async (c, next) => {
    const t0 = performance.now();
    await next();
    const extra = c.get("rpc" as never) as { rpc?: string; tool?: string } | undefined;
    log({ event: "http", method: c.req.method, path: knownPath(new URL(c.req.url).pathname), status: c.res.status, ms: Math.round(performance.now() - t0), ...(extra ?? {}) });
  });

  // Rate limit: sliding one-minute window per client (IPv4 address or IPv6 /64), in memory, per instance.
  const limiter = new RateLimiter(limit, opts.rateLimitMaxKeys ?? CONFIG.rateLimitMaxKeys);
  setInterval(() => limiter.sweep(Date.now()), 60_000).unref();
  app.use("*", async (c, next) => {
    if (c.req.path === "/healthz" || c.req.method === "OPTIONS") return next();
    const retry = limiter.hit(clientIp(c, hops), Date.now());
    if (retry) {
      const body = c.req.path === "/mcp" ? rpcError(-32000, `Rate limit exceeded: ${limit} requests per minute. Retry in ${retry} s.`) : { error: "rate_limited", retry_after_s: retry };
      return c.json(body, 429, { "Retry-After": String(retry) });
    }
    return next();
  });

  // MCP responses are per-request answers: never cache them (matters behind Firebase Hosting or any CDN).
  app.use("/mcp", async (c, next) => { await next(); c.res.headers.set("Cache-Control", "no-store"); });
  app.use("/mcp", cors({
    origin: "*", allowMethods: ["POST", "GET", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Accept", "Authorization", "Mcp-Session-Id", "Mcp-Protocol-Version", "Last-Event-ID"],
    exposeHeaders: ["Mcp-Session-Id", "Mcp-Protocol-Version"], maxAge: 86400,
  }));
  app.use("/mcp", bodyLimit({ maxSize: CONFIG.maxBodyBytes, onError: (c) => c.json(rpcError(-32000, "Request body too large: the limit is 2 MB."), 413) }));

  app.post("/mcp", async (c) => {
    let parsed: unknown;
    try { parsed = JSON.parse(await c.req.text()); } catch { return c.json(rpcError(-32700, "Parse error: the body is not valid JSON"), 400); }
    const first = (Array.isArray(parsed) ? parsed[0] : parsed) as { method?: unknown; params?: { name?: unknown } } | undefined;
    if (first && typeof first === "object" && "method" in first) c.set("rpc" as never, logRpc(first.method, first.params?.name) as never);
    const server = buildServer();
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: CONFIG.maxBodyBytes });
    await server.connect(transport);
    try {
      return await transport.handleRequest(c.req.raw, { parsedBody: parsed });
    } finally {
      void transport.close(); void server.close();
    }
  });
  // Stateless server: no SSE stream to open and no session to delete.
  app.on(["GET", "DELETE", "PUT", "PATCH"], "/mcp", (c) => c.json(rpcError(-32000, "Method not allowed."), 405, { Allow: "POST" }));

  app.get("/healthz", (c) => c.json({ ok: true, service: SERVICE.name, version: SERVICE.version }, 200, { "Cache-Control": "no-store" }));

  app.on(["GET", "HEAD"], "*", (c) => {
    const f = site.get(c.req.path);
    if (!f) return c.text("Not found", 404, PAGE_HEADERS);
    const headers = { ...PAGE_HEADERS, "Content-Type": f.type, "Cache-Control": f.cache };
    if (c.req.method === "HEAD") return c.body(null, 200, headers);
    return c.body(f.body as Uint8Array<ArrayBuffer>, 200, headers);
  });
  app.notFound((c) => c.text("Not found", 404, PAGE_HEADERS));
  app.onError((err, c) => {
    log({ event: "http_error", path: new URL(c.req.url).pathname, error: err.name }, "ERROR");
    return c.req.path === "/mcp" ? c.json(rpcError(-32603, "Internal error"), 500) : c.text("Internal error", 500, PAGE_HEADERS);
  });
  return app;
}

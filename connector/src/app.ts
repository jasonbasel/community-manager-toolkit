/**
 * HTTP app (Hono): POST /mcp (MCP Streamable HTTP, stateless JSON responses), GET /healthz and
 * the product pages. Per-IP rate limit in memory, 2 MB body limit, security headers on pages,
 * CORS on /mcp as the transport requires. Logs never include inputs or IP addresses.
 */
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CONFIG, SERVICE } from "./config.js";
import { log } from "./log.js";
import { buildServer } from "./mcp.js";
import { loadSite, type SiteFile } from "./site.js";

export interface AppOptions { rateLimitPerMin?: number; trustedProxyHops?: number; site?: Map<string, SiteFile> }

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

/** Client IP for rate limiting only (never logged): the address the trusted proxy chain saw. */
export function clientIp(c: Context, hops: number): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((x) => x.trim()).filter(Boolean);
    if (parts.length) return parts[Math.max(0, parts.length - hops)];
  }
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? "local";
}

export function createApp(opts: AppOptions = {}) {
  const limit = opts.rateLimitPerMin ?? CONFIG.rateLimitPerMin;
  const hops = opts.trustedProxyHops ?? CONFIG.trustedProxyHops;
  const site = opts.site ?? loadSite();
  const app = new Hono();

  // Access log: method, path, status, latency, and for MCP the JSON-RPC method and tool name only.
  app.use("*", async (c, next) => {
    const t0 = performance.now();
    await next();
    const extra = c.get("rpc" as never) as { rpc?: string; tool?: string } | undefined;
    log({ event: "http", method: c.req.method, path: new URL(c.req.url).pathname, status: c.res.status, ms: Math.round(performance.now() - t0), ...(extra ?? {}) });
  });

  // Rate limit: sliding one-minute window per client IP (in memory, per instance).
  const hits = new Map<string, number[]>();
  app.use("*", async (c, next) => {
    if (c.req.path === "/healthz" || c.req.method === "OPTIONS") return next();
    const ip = clientIp(c, hops), now = Date.now();
    const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (arr.length >= limit) {
      hits.set(ip, arr);
      const retry = Math.max(1, Math.ceil((60_000 - (now - arr[0])) / 1000));
      const body = c.req.path === "/mcp" ? rpcError(-32000, `Rate limit exceeded: ${limit} requests per minute. Retry in ${retry} s.`) : { error: "rate_limited", retry_after_s: retry };
      return c.json(body, 429, { "Retry-After": String(retry) });
    }
    arr.push(now);
    hits.set(ip, arr);
    if (hits.size > 50_000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] >= 60_000) hits.delete(k);
    return next();
  });

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
    if (first && typeof first.method === "string") {
      c.set("rpc" as never, { rpc: first.method, ...(first.method === "tools/call" && typeof first.params?.name === "string" ? { tool: first.params.name.slice(0, 64) } : {}) } as never);
    }
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

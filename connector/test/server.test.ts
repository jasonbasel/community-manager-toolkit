/** HTTP routes, limits and the MCP protocol end to end (in-process: the SDK client fetches app.fetch). */
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../src/app.js";
import { CONFIG } from "../src/config.js";
import { TOOL_TEXT } from "../src/mcp.js";
import { loadSite, siteDir } from "../src/site.js";
import { UI_MIME } from "../src/ui.js";
import { eventGuests, hasFixture, md01Records, readCsv } from "./helpers/fixtures.js";

const selfContained = (html: string) => {
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "<script></script>");
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) ?? ["", ""])[1];
  return !/\b(src|href)\s*=/i.test(markup) && !/<link\b/i.test(markup) && !/@import|url\(/i.test(css);
};
const app = createApp({ rateLimitPerMin: 10_000 });
const BASE = "http://test.local";
const PAGES = ["/", "/index.html", "/privacy", "/privacy.html", "/terms", "/terms.html", "/support", "/support.html"];
const TOOLS = ["detect_member_fields", "merge_member_records", "pair_attendees", "segment_members", "plan_week", "compute_impact_metrics", "check_draft_message"];

describe.runIf(siteDir() !== null)("product pages", () => {
  for (const p of PAGES) {
    it(`serves ${p} as HTML with security headers`, async () => {
      const r = await app.request(p);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(r.headers.get("content-security-policy")).toMatch(/default-src 'none'/);
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
      expect(r.headers.get("x-frame-options")).toBe("DENY");
      expect(r.headers.get("strict-transport-security")).toMatch(/max-age/);
      expect(await r.text()).toMatch(/<html/i);
    });
  }
  it("serves aliases with the same content as the .html files", async () => {
    for (const p of ["privacy", "terms", "support"]) expect(await (await app.request(`/${p}`)).text()).toBe(await (await app.request(`/${p}.html`)).text());
    expect(await (await app.request("/")).text()).toBe(await (await app.request("/index.html")).text());
  });
  it("serves every other docs file at its path with the right type", async () => {
    const site = loadSite();
    const expectType: Record<string, string> = { "/style.css": "text/css; charset=utf-8", "/assets/logo.png": "image/png", "/assets/icon.png": "image/png", "/robots.txt": "text/plain; charset=utf-8", "/sitemap.xml": "application/xml; charset=utf-8" };
    for (const [path, type] of Object.entries(expectType)) {
      if (!site.has(path)) continue;
      const r = await app.request(path);
      expect(r.status, path).toBe(200);
      expect(r.headers.get("content-type"), path).toBe(type);
    }
    for (const path of site.keys()) expect((await app.request(path)).status, path).toBe(200);
  });
  it("404s dotfiles, traversal and unknown paths; HEAD has no body", async () => {
    for (const p of ["/.nojekyll", "/../package.json", "/%2e%2e/package.json", "/src/app.ts", "/nope"]) expect((await app.request(p)).status, p).toBe(404);
    const h = await app.request("/", { method: "HEAD" });
    expect(h.status).toBe(200);
    expect(await h.text()).toBe("");
  });
});

describe("service routes and limits", () => {
  it("/healthz", async () => {
    const r = await app.request("/healthz");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, service: "community-manager-toolkit" });
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects GET and DELETE on /mcp with 405 (stateless)", async () => {
    for (const method of ["GET", "DELETE"]) {
      const r = await app.request("/mcp", { method });
      expect(r.status).toBe(405);
      expect(r.headers.get("allow")).toBe("POST");
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect(await r.json()).toMatchObject({ jsonrpc: "2.0", error: { code: -32000 } });
    }
  });
  it("answers CORS preflight for MCP clients", async () => {
    const r = await app.request("/mcp", { method: "OPTIONS", headers: { Origin: "https://claude.ai", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,mcp-protocol-version" } });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("access-control-allow-headers")).toMatch(/Mcp-Protocol-Version/i);
  });
  const post = (body: string) => app.request("/mcp", { method: "POST", body, headers: { "content-type": "application/json", accept: "application/json, text/event-stream" } });
  it("returns a JSON-RPC parse error for invalid JSON", async () => {
    const r = await post("{nope");
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: { code: -32700 } });
  });
  it("refuses bodies over 2 MB", async () => {
    const r = await post(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { pad: "x".repeat(2 * 1024 * 1024 + 10) } }));
    expect(r.status).toBe(413);
  });
  it("rate-limits per client IP (60/min by default) and exempts /healthz", async () => {
    expect(CONFIG.rateLimitPerMin).toBe(60);
    const small = createApp({ rateLimitPerMin: 3, site: new Map() });
    const hit = (ip: string) => small.request("/nope", { headers: { "x-forwarded-for": `9.9.9.9, ${ip}` } });
    for (let i = 0; i < 3; i++) expect((await hit("1.1.1.1")).status).toBe(404);
    const r = await hit("1.1.1.1");
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await hit("2.2.2.2")).status).toBe(404);
    expect((await small.request("/healthz", { headers: { "x-forwarded-for": "1.1.1.1" } })).status).toBe(200);
  });
});

describe("MCP over Streamable HTTP", () => {
  let client: Client;
  const logged: string[] = [];
  beforeAll(async () => {
    client = new Client({ name: "vitest", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { fetch: (url, init) => app.fetch(new Request(url, init)) }));
  });
  afterAll(async () => { await client.close(); });

  it("lists exactly the seven tools with read-only annotations and plain descriptions", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOLS].sort());
    for (const t of tools) {
      expect(t.name.length).toBeLessThanOrEqual(64);
      expect(t.title).toBeTruthy();
      expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
      const d = t.description ?? "";
      expect(d.length).toBeGreaterThan(120);
      for (const other of TOOLS) if (other !== t.name) expect(d, `${t.name} mentions ${other}`).not.toContain(other);
      expect(d, `${t.name} tells the model to use another step`).not.toMatch(/\b(call|invoke|then use|run the|next step)\b/i);
      expect(d, `${t.name} promotes`).not.toMatch(/\b(best-in-class|world-class|powerful|amazing|premium|upgrade|sign up|pricing|free trial|visit|commonos|number one)\b/i);
      expect(t.inputSchema.type).toBe("object");
    }
    expect(Object.keys(TOOL_TEXT).sort()).toEqual([...TOOLS].sort());
  });
  it("points the view tools at ui:// resources, with the ChatGPT alias", async () => {
    const { tools } = await client.listTools();
    const meta = (n: string) => tools.find((t) => t.name === n)!._meta as Record<string, unknown>;
    const expected: Record<string, string> = { pair_attendees: "pairs", compute_impact_metrics: "report", merge_member_records: "directory" };
    for (const [tool, view] of Object.entries(expected)) {
      const uri = `ui://community-manager-toolkit/${view}.html`;
      expect(meta(tool)).toMatchObject({ ui: { resourceUri: uri }, "ui/resourceUri": uri, "openai/outputTemplate": uri });
    }
  });
  it("lists and reads three self-contained ui:// views", async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri).sort()).toEqual(["directory", "pairs", "report"].map((v) => `ui://community-manager-toolkit/${v}.html`));
    const domain = createHash("sha256").update(CONFIG.publicMcpUrl).digest("hex").slice(0, 32) + ".claudemcpcontent.com";
    for (const r of resources) {
      expect(r.mimeType).toBe(UI_MIME);
      const read = await client.readResource({ uri: r.uri });
      const c = read.contents[0] as { text: string; mimeType: string; _meta: { ui: { domain: string; csp: unknown } } };
      expect(c.mimeType).toBe(UI_MIME);
      expect(c._meta.ui).toMatchObject({ domain, csp: { connectDomains: [], resourceDomains: [] } });
      expect(c.text.startsWith("<!doctype html>")).toBe(true);
      expect(selfContained(c.text)).toBe(true);
    }
  }, 30000);

  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as { type: string; text: string }[])[0].text;
    return { r, text, sc: r.structuredContent as Record<string, unknown> | undefined };
  };
  it("calls every tool successfully with a text summary and structured content", async () => {
    const guests = hasFixture("event_guests.csv") ? eventGuests() : [{ id: "A", organisation: "a" }, { id: "B", organisation: "b" }];
    const cases: [string, Record<string, unknown>][] = [
      ["detect_member_fields", { source_name: "hubspot.csv", headers: ["Record ID", "First Name", "Last Name", "Email", "Company Name", "Marketing contact status"] }],
      ["merge_member_records", { records: hasFixture("applications.csv") ? md01Records() : [{ source: "hubspot", name: "A B" }], today: "2026-10-02" }],
      ["pair_attendees", { event: { name: "Evening" }, guests }],
      ["segment_members", { today: "2026-10-02", members: [{ id: "A", initiated_90d: 2 }, { id: "B", last_active: "2026-01-01" }] }],
      ["plan_week", { today: "2026-10-02", ledger: hasFixture("ledger.csv") ? readCsv("ledger.csv") : [] }],
      ["compute_impact_metrics", { period: { start: "2026-07-01", end: "2026-09-30" }, ledger: hasFixture("ledger.csv") ? readCsv("ledger.csv") : [] }],
      ["check_draft_message", { channel: "whatsapp", text: "Hi Kasper, Yusuf would like to meet you. Shall I introduce you?" }],
    ];
    for (const [name, args] of cases) {
      const { r, text, sc } = await call(name, args);
      expect(r.isError, `${name}: ${text}`).toBeFalsy();
      expect(text.length, name).toBeGreaterThan(20);
      expect(sc, name).toBeTruthy();
    }
  }, 30000);
  it("returns specific errors", async () => {
    let res = await call("pair_attendees", { guests: [{ id: "A" }, { name: "no id" }] });
    expect(res.r.isError).toBe(true);
    expect(res.text).toMatch(/required value is missing at guests\[1\]\.id/);
    res = await call("pair_attendees", { guests: [{ id: "A" }, { id: "A" }] });
    expect(res.text).toMatch(/guests\[1\]\.id 'A' is duplicated/);
    res = await call("merge_member_records", { records: [{ name: "No Source" }] });
    expect(res.text).toMatch(/records\[0\]\.source/);
    res = await call("check_draft_message", { channel: "telegram", text: "hi" });
    expect(res.text).toMatch(/channel/);
  });
  it("logs only the tool name, timing, counts and status; never inputs", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation((line: string) => { logged.push(String(line)); });
    const prev = CONFIG.logging;
    (CONFIG as { logging: boolean }).logging = true;
    try {
      await call("pair_attendees", { guests: [{ id: "Zebedee Quarrington", organisation: "Secret Org" }, { id: "Ottoline Vasquez", organisation: "Other" }] });
    } finally { (CONFIG as { logging: boolean }).logging = prev; spy.mockRestore(); }
    const joined = logged.join("\n");
    expect(joined).toMatch(/"event":"tool","tool":"pair_attendees"/);
    expect(joined).toMatch(/"records_in":2/);
    expect(joined).not.toMatch(/Zebedee|Quarrington|Secret Org|Ottoline/);
  });
});

/**
 * Smoke test over real HTTP. Starts the built server on a free port (or uses the URL given as the
 * first argument), then: checks the pages and /healthz, lists tools and ui:// resources with an
 * MCP client over Streamable HTTP, reads each view and calls every tool. Exits non-zero on failure.
 *   npm run smoke                      # local: node dist/server.js on a free port
 *   npm run smoke -- https://toolkit.commonos.ai
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { eventGuests, hasFixture, md01Records, readCsv } from "../test/helpers/fixtures.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const ok = (cond: unknown, label: string) => { console.log(`${cond ? "ok  " : "FAIL"} ${label}`); if (!cond) failures++; };

const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); s.on("error", rej); });

async function startLocal(): Promise<{ base: string; child: ChildProcess }> {
  const port = await freePort();
  const entry = join(root, "dist", "server.js");
  const [cmd, args] = existsSync(entry) ? [process.execPath, [entry]] : [process.execPath, [join(root, "node_modules", "tsx", "dist", "cli.mjs"), join(root, "src", "server.ts")]];
  const child = spawn(cmd, args, { cwd: root, env: { ...process.env, PORT: String(port), CMT_LOG: "off" }, stdio: ["ignore", "ignore", "inherit"] });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) return { base, child }; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error("server did not start within 10 s");
}

const remote = process.argv[2];
const { base, child } = remote ? { base: remote.replace(/\/$/, ""), child: null } : await startLocal();
console.log(`smoke: ${base}${child ? " (local server started by this script)" : ""}`);
try {
  // ---- pages and health ----
  const pages: [string, string][] = [["/healthz", "application/json"], ["/", "text/html"], ["/index.html", "text/html"], ["/privacy", "text/html"], ["/privacy.html", "text/html"],
    ["/terms", "text/html"], ["/terms.html", "text/html"], ["/support", "text/html"], ["/support.html", "text/html"], ["/style.css", "text/css"],
    ["/assets/logo.png", "image/png"], ["/robots.txt", "text/plain"], ["/sitemap.xml", "application/xml"]];
  for (const [path, type] of pages) {
    const r = await fetch(base + path);
    ok(r.status === 200 && (r.headers.get("content-type") ?? "").startsWith(type), `GET ${path} → ${r.status} ${r.headers.get("content-type")}`);
  }
  for (const method of ["GET", "DELETE"]) { const r = await fetch(`${base}/mcp`, { method }); ok(r.status === 405, `${method} /mcp → ${r.status} (stateless)`); }

  // ---- MCP ----
  const client = new Client({ name: "cmt-smoke", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  const info = client.getServerVersion();
  ok(info?.name === "community-manager-toolkit", `initialize → ${info?.title ?? info?.name} ${info?.version}`);
  const { tools } = await client.listTools();
  ok(tools.length === 7, `tools/list → ${tools.length} tools: ${tools.map((t) => `${t.name}${t.annotations?.readOnlyHint ? " [read-only]" : ""}`).join(", ")}`);
  const { resources } = await client.listResources();
  const ui = resources.filter((r) => r.uri.startsWith("ui://"));
  ok(ui.length >= 2 && ui.length <= 3, `resources/list → ${ui.length} ui:// views: ${ui.map((r) => r.uri).join(", ")}`);
  for (const r of ui) {
    const read = await client.readResource({ uri: r.uri });
    const c = read.contents[0] as { text?: string; mimeType?: string };
    ok(c.mimeType === "text/html;profile=mcp-app" && (c.text ?? "").startsWith("<!doctype html>"), `resources/read ${r.uri} → ${c.mimeType}, ${Math.round((c.text ?? "").length / 1024)} KB`);
  }

  const fx = (name: string) => hasFixture(name);
  const ledger = fx("ledger.csv") ? readCsv("ledger.csv") : [{ intro_id: "x", created: "2026-07-01", requester: "A", target: "B", status: "connected", outcome: "ok", rating: "4" }];
  const members = fx("members.csv") ? readCsv("members.csv") : [{ name: "A", joined: "2026-09-20", last_active: "2026-09-30" }];
  const calls: [string, Record<string, unknown>][] = [
    ["detect_member_fields", { source_name: "hubspot_contacts.csv", headers: ["Record ID", "First Name", "Last Name", "Email", "Phone Number", "Company Name", "Job Title", "City", "Create Date", "Last Activity Date", "Marketing contact status"] }],
    ["merge_member_records", { records: fx("applications.csv") ? md01Records() : [{ source: "hubspot", name: "Ann Lee", organisation: "Acme" }], today: "2026-10-02" }],
    ["pair_attendees", { event: { name: "Founders & Operators Evening", starts_at: "2026-10-08T18:30:00+01:00" }, guests: fx("event_guests.csv") ? eventGuests() : [{ id: "A", organisation: "a" }, { id: "B", organisation: "b" }] }],
    ["segment_members", { today: "2026-10-02", members: members.map((m) => ({ id: m.name, last_active: m.last_active, joined: m.joined })) }],
    ["plan_week", { today: "2026-10-02", ledger, new_members: members.map((m) => ({ name: m.name, joined: m.joined })), events: [{ name: "Founders & Operators Evening", starts_at: "2026-10-08T18:30", matched: false }] }],
    ["compute_impact_metrics", { period: { start: "2026-07-01", end: "2026-09-30" }, ledger }],
    ["check_draft_message", { channel: "whatsapp", purpose: "welcome", text: "Hi Kasper, welcome to Northbridge. Yusuf at Aperture Drones would like to meet you about warehouse pilots. Shall I introduce you?\n— Priya, Northbridge" }],
  ];
  for (const [name, args] of calls) {
    const t0 = performance.now();
    const r = await client.callTool({ name, arguments: args });
    const ms = Math.round(performance.now() - t0);
    const text = ((r.content as { type: string; text?: string }[])[0]?.text ?? "").split("\n")[0];
    ok(!r.isError && !!r.structuredContent, `tools/call ${name} (${ms} ms) → ${text.slice(0, 150)}`);
  }
  await client.close();
} catch (e) {
  failures++;
  console.log(`FAIL ${(e as Error).message}`);
} finally {
  child?.kill();
}
console.log(failures ? `smoke: ${failures} failure(s)` : "smoke: all checks passed");
process.exit(failures ? 1 : 0);

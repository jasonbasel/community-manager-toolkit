/**
 * MCP App views: one self-contained HTML file each (`text/html;profile=mcp-app`), bundled with
 * esbuild at build time into dist/ui. Claude and ChatGPT render the same resource; Claude also
 * needs `_meta.ui.domain`, derived from the public MCP URL. No network access: no CDN, no
 * analytics, fonts embedded as bytes and loaded with the FontFace API.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG, SERVICE } from "./config.js";

const here = dirname(fileURLToPath(import.meta.url));
export const UI_MIME = "text/html;profile=mcp-app";
export const UI = {
  pairs: "ui://community-manager-toolkit/pairs.html",
  report: "ui://community-manager-toolkit/report.html",
  directory: "ui://community-manager-toolkit/directory.html",
} as const;
export type UiName = keyof typeof UI;
export const UI_NAMES = Object.keys(UI) as UiName[];

const TITLES: Record<UiName, { title: string; description: string; invoking: string; invoked: string }> = {
  pairs: { title: "Pairs for approval", description: "Table of proposed event pairs with strength, basis and backups; the manager can keep, remove or swap partners and approve.", invoking: "Pairing guests…", invoked: "Pairs ready" },
  report: { title: "Impact report", description: "Intro funnel, outcome mix and coverage for the period.", invoking: "Counting the ledger…", invoked: "Metrics ready" },
  directory: { title: "Directory review", description: "Merge statistics, field coverage and uncertain matches for the manager to confirm.", invoking: "Merging records…", invoked: "Directory ready" },
};

export const claudeUiDomain = (serverUrl: string = CONFIG.publicMcpUrl) =>
  createHash("sha256").update(serverUrl).digest("hex").slice(0, 32) + ".claudemcpcontent.com";

/** Tool-side metadata: portable key, the legacy key and the ChatGPT alias. */
export const uiToolMeta = (name: UiName) => ({
  ui: { resourceUri: UI[name] },
  "ui/resourceUri": UI[name],
  "openai/outputTemplate": UI[name],
  "openai/toolInvocation/invoking": TITLES[name].invoking,
  "openai/toolInvocation/invoked": TITLES[name].invoked,
});

/** Resource-side metadata: no external origins at all; clipboard for the copy buttons. */
export const uiResourceMeta = (name: UiName) => ({
  ui: { domain: claudeUiDomain(), prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] }, permissions: { clipboardWrite: {} } },
  "openai/widgetPrefersBorder": true,
  "openai/widgetCSP": { connect_domains: [], resource_domains: [] },
  "openai/widgetDescription": TITLES[name].description,
});
export const uiTitle = (name: UiName) => `${SERVICE.title}: ${TITLES[name].title}`;

// ---------------------------------------------------------------------------- fonts
const FONT_FILES = [
  { family: "Switzer", file: "switzer-variable-latin.woff2", weight: "400 700", licence: "Switzer by Indian Type Foundry (Fontshare), ITF Free Font License" },
  { family: "IBM Plex Mono", file: "ibm-plex-mono-latin-400.woff2", weight: "400", licence: "IBM Plex Mono, Copyright IBM Corp., SIL Open Font License 1.1" },
];

/** Where brand fonts are read from: BRAND_FONTS_DIR, else the CommonOS brand folder, else connector/brand-fonts (all optional). */
export function brandFontsDir(): string | null {
  const candidates = [process.env.BRAND_FONTS_DIR, join(homedir(), "Desktop", "commonos", "brand", "fonts"), join(here, "..", "brand-fonts")];
  for (const d of candidates) if (d && existsSync(d)) return d;
  return null;
}

export function fontPayload(dir = brandFontsDir()): { json: string; families: string[]; notice: string } {
  const fonts: Record<string, { weight: string; b64: string }> = {};
  const notices: string[] = [];
  if (dir) {
    for (const f of FONT_FILES) {
      const p = join(dir, f.file);
      if (!existsSync(p)) continue;
      fonts[f.family] = { weight: f.weight, b64: readFileSync(p).toString("base64") };
      notices.push(f.licence);
    }
  }
  return { json: JSON.stringify(fonts), families: Object.keys(fonts), notice: notices.join("; ") };
}

// ---------------------------------------------------------------------------- build
const cache = new Map<UiName, string>();

export async function getUiHtml(name: UiName): Promise<string> {
  const hit = cache.get(name);
  if (hit) return hit;
  for (const p of [join(here, "ui", `${name}.html`), join(here, "..", "dist", "ui", `${name}.html`)]) {
    if (existsSync(p)) { const html = readFileSync(p, "utf8"); cache.set(name, html); return html; }
  }
  const html = await buildUi(name); // development only: esbuild is a dev dependency
  cache.set(name, html);
  return html;
}

function sourceDir(): string {
  for (const d of [join(here, "ui"), join(here, "..", "src", "ui")]) if (existsSync(join(d, "app.css"))) return d;
  throw new Error("view sources not found (src/ui)");
}

export async function buildUi(name: UiName, fontsDir = brandFontsDir()): Promise<string> {
  const esbuild = await import("esbuild");
  const dir = sourceDir();
  const out = await esbuild.build({
    entryPoints: [join(dir, `${name}.ts`)], bundle: true, write: false, format: "iife", platform: "browser", target: "es2020",
    minify: true, legalComments: "none", logLevel: "silent",
  });
  const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const css = readFileSync(join(dir, "app.css"), "utf8");
  const fonts = fontPayload(fontsDir);
  const notice = fonts.notice ? `<!-- Fonts: ${fonts.notice}. Embedded for display in this view only. -->` : "";
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<meta name="color-scheme" content="light dark"><title>${uiTitle(name)}</title>${notice}<style>${css}</style></head>`
    + `<body><main id="root"><p class="muted">Loading…</p></main>`
    + `<script type="application/json" id="cmt-fonts">${fonts.json}</script><script>${js}</script></body></html>`;
}

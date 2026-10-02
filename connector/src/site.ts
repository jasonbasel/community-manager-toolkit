/**
 * Product pages: every file under the site folder (a build-time copy of ../docs) is served at its
 * own path, loaded into memory at start-up (no filesystem access per request, so no traversal).
 * Dotfiles are skipped. Extensionless aliases /privacy, /terms and /support serve the same
 * content as the .html files (200, not a redirect), so directory reviewers can use either URL.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "./config.js";

export interface SiteFile { body: Uint8Array; type: string; cache: string }

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".js": "text/javascript; charset=utf-8",
};
export const ALIASES: Readonly<Record<string, string>> = { "/": "/index.html", "/privacy": "/privacy.html", "/terms": "/terms.html", "/support": "/support.html" };

const here = dirname(fileURLToPath(import.meta.url));

/** The first site folder that exists: SITE_DIR, then connector/site, then ../docs (development). */
export function siteDir(): string | null {
  for (const d of [CONFIG.siteDir, join(here, "..", "site"), join(here, "..", "..", "docs")]) if (d && existsSync(join(d, "index.html"))) return d;
  return null;
}

export function loadSite(dir = siteDir()): Map<string, SiteFile> {
  const files = new Map<string, SiteFile>();
  if (!dir) return files;
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      if (name.startsWith(".")) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      const ext = extname(name).toLowerCase();
      const type = TYPES[ext];
      if (!type) continue;
      const route = "/" + relative(dir, p).split(sep).join("/");
      files.set(route, { body: readFileSync(p), type, cache: ext === ".html" || ext === ".xml" || ext === ".txt" ? "public, max-age=300" : "public, max-age=86400" });
    }
  };
  walk(dir);
  for (const [alias, target] of Object.entries(ALIASES)) { const f = files.get(target); if (f) files.set(alias, f); }
  return files;
}

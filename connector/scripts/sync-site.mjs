/**
 * Copy the product pages from ../docs into ./site (gitignored, but carried by the Cloud Run source
 * upload; see .gcloudignore). Files are copied verbatim; edit ../docs, never ./site.
 * Inside the Docker build ../docs does not exist: then an existing ./site is kept as it is.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = process.env.DOCS_DIR ?? join(root, "..", "docs");
const dest = join(root, "site");
if (!existsSync(join(src, "index.html"))) {
  if (existsSync(join(dest, "index.html"))) { console.error(`site: ${src} not found; keeping the existing ./site (${readdirSync(dest).length} entries)`); process.exit(0); }
  console.error(`site: neither ${src} nor ./site has index.html. Run 'npm run build' from the repo checkout before deploying.`);
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true, filter: (p) => !p.split(/[\\/]/).pop().startsWith(".") || p === src });
console.error(`site: copied ${src} → ./site`);

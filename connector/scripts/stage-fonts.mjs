/**
 * Stage the CommonOS brand fonts into ./brand-fonts (gitignored; never commit them, the Switzer
 * licence forbids making the files available to others) so a Cloud Run source deploy can embed
 * them in the views. Reads BRAND_FONTS_DIR (default ~/Desktop/commonos/brand/fonts).
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = process.env.BRAND_FONTS_DIR ?? join(homedir(), "Desktop", "commonos", "brand", "fonts");
const dest = join(root, "brand-fonts");
const files = ["switzer-variable-latin.woff2", "LICENSE-switzer-FFL.txt", "ibm-plex-mono-latin-400.woff2", "LICENSE-ibm-plex-mono-OFL.txt"];
if (!existsSync(src)) { console.error(`fonts: ${src} not found; the views will use system fonts`); process.exit(0); }
mkdirSync(dest, { recursive: true });
let n = 0;
for (const f of files) if (existsSync(join(src, f))) { copyFileSync(join(src, f), join(dest, f)); n++; }
console.error(`fonts: staged ${n} file(s) into ./brand-fonts (gitignored)`);

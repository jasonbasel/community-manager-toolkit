/** Build step: prebuild the MCP App views into dist/ui so the runtime needs no bundler. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brandFontsDir, buildUi, fontPayload, UI_NAMES } from "./ui.js";

mkdirSync("dist/ui", { recursive: true });
const dir = brandFontsDir();
const fonts = fontPayload(dir).families;
console.error(fonts.length ? `fonts: embedding ${fonts.join(", ")} from ${dir}` : "fonts: none found (BRAND_FONTS_DIR unset or empty); views use system fonts");
for (const name of UI_NAMES) {
  const html = await buildUi(name, dir);
  writeFileSync(join("dist/ui", `${name}.html`), html);
  console.error(`built dist/ui/${name}.html (${Math.round(html.length / 1024)} KB)`);
}

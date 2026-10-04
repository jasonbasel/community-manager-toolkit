/** The MCP App views build without brand fonts, embed them when present, and load nothing from the network. */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildUi, claudeUiDomain, fontPayload, UI, UI_NAMES, uiResourceMeta, uiToolMeta } from "../src/ui.js";

const selfContained = (html: string) => {
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "<script></script>");
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) ?? ["", ""])[1];
  return !/\b(src|href)\s*=/i.test(markup) && !/<link\b/i.test(markup) && !/@import|url\(/i.test(css);
};
const empty = mkdtempSync(join(tmpdir(), "cmt-nofonts-"));
const fake = mkdtempSync(join(tmpdir(), "cmt-fonts-"));
writeFileSync(join(fake, "switzer-variable-latin.woff2"), Buffer.from("not-a-real-font"));

describe("views", () => {
  for (const name of UI_NAMES) {
    it(`${name}.html builds without fonts and is self-contained`, async () => {
      const html = await buildUi(name, empty);
      expect(html.startsWith("<!doctype html>")).toBe(true);
      expect(html).toContain('<script type="application/json" id="cmt-fonts">{}</script>');
      expect(selfContained(html)).toBe(true);
      expect(html).not.toMatch(/\bgtag\(|google-analytics\.com|googletagmanager\.com|cdn\.segment\.(io|com)|api\.mixpanel|plausible\.io|static\.hotjar|sendBeacon/i);
      expect((html.match(/<\/script>/g) ?? []).length).toBe(2);
      expect(html).toContain('lang="en-GB"');
    }, 30000);
  }
  it("embeds brand fonts as bytes when BRAND_FONTS_DIR has them", async () => {
    expect(fontPayload(empty).families).toEqual([]);
    expect(fontPayload(fake).families).toEqual(["Switzer"]);
    const html = await buildUi("report", fake);
    expect(html).toMatch(/"Switzer":\{"weight":"400 700","b64":"/);
    expect(html).toMatch(/<!-- Fonts: Switzer/);
  }, 30000);
  it("advertises the views to Claude and ChatGPT", () => {
    expect(claudeUiDomain("https://toolkit.commonos.ai/mcp")).toMatch(/^[0-9a-f]{32}\.claudemcpcontent\.com$/);
    expect(uiToolMeta("pairs")).toMatchObject({ ui: { resourceUri: UI.pairs }, "ui/resourceUri": UI.pairs, "openai/outputTemplate": UI.pairs });
    expect(uiResourceMeta("pairs")).toMatchObject({ ui: { prefersBorder: true, permissions: { clipboardWrite: {} } }, "openai/widgetCSP": { connect_domains: [], resource_domains: [] } });
  });
});

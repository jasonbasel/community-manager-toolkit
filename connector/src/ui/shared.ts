/** Shared view helpers: connect to the host, follow its theme, load embedded fonts, copy text. */
import { App, applyDocumentTheme } from "@modelcontextprotocol/ext-apps";

export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Load fonts embedded by the build as bytes (FontFace with binary data: no fetch, so no CSP font-src needed). */
export function loadFonts(): void {
  try {
    const el = document.getElementById("cmt-fonts");
    if (!el || typeof FontFace === "undefined") return;
    const fonts = JSON.parse(el.textContent || "{}") as Record<string, { weight: string; b64: string }>;
    for (const [family, f] of Object.entries(fonts)) {
      const bin = atob(f.b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const face = new FontFace(family, bytes, { weight: f.weight, style: "normal", display: "swap" });
      face.load().then((ff) => document.fonts.add(ff)).catch(() => undefined);
    }
  } catch { /* system fonts */ }
}

export type ToolResultParams = { structuredContent?: unknown; content?: { type: string; text?: string }[]; isError?: boolean };
export const resultText = (r: ToolResultParams): string => (r.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");

export function connect(name: string, onResult: (r: ToolResultParams) => void): App {
  loadFonts();
  const app = new App({ name, version: "0.1.0" }, {}, { autoResize: true });
  app.ontoolresult = (params) => onResult(params as ToolResultParams);
  app.onhostcontextchanged = (ctx) => { if (ctx.theme) applyDocumentTheme(ctx.theme); };
  void app.connect().then(() => { const t = app.getHostContext()?.theme; if (t) applyDocumentTheme(t); }).catch(() => undefined);
  return app;
}

/** Copy text: Clipboard API, then execCommand, then a selectable box as the last resort. */
export async function copyText(text: string, fallbackHost: HTMLElement): Promise<"copied" | "shown"> {
  try { await navigator.clipboard.writeText(text); return "copied"; } catch { /* next */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (ok) return "copied";
  } catch { /* next */ }
  fallbackHost.innerHTML = `<p class="note">Copy this text:</p><textarea readonly>${esc(text)}</textarea>`;
  (fallbackHost.querySelector("textarea") as HTMLTextAreaElement | null)?.select();
  return "shown";
}

/** Send one message into the conversation; if the host refuses, show the text to paste instead. */
export async function sendToChat(app: App, text: string, statusEl: HTMLElement): Promise<boolean> {
  try {
    const r = await app.sendMessage({ role: "user", content: [{ type: "text", text }] });
    if (!r?.isError) { statusEl.innerHTML = `<span class="ok">Sent to the conversation.</span>`; return true; }
  } catch { /* fall through */ }
  statusEl.innerHTML = `<p class="err">This app can't post into the chat here. Copy the text below and paste it as your reply.</p><textarea readonly>${esc(text)}</textarea>`;
  return false;
}

export const pct = (n: number) => `${Math.round(n * 10) / 10}%`;

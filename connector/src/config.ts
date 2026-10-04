/** Runtime settings. None are secret; all have safe defaults (see DEPLOY.md). */
export const SERVICE = {
  name: "community-manager-toolkit",
  title: "Community Manager Toolkit by CommonOS",
  version: "0.1.0",
  website: "https://toolkit.commonos.ai",
} as const;

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

export const CONFIG = {
  port: num(process.env.PORT, 8787),
  /** The public MCP URL users add in Claude; Claude derives the views' sandbox domain from it. */
  publicMcpUrl: process.env.PUBLIC_MCP_URL ?? `${SERVICE.website}/mcp`,
  /** Requests per IP per minute (in memory, per instance). */
  rateLimitPerMin: num(process.env.RATE_LIMIT_PER_MIN, 600),
  /** Most clients tracked by the rate limiter at once (least recently seen evicted first). */
  rateLimitMaxKeys: num(process.env.RATE_LIMIT_MAX_KEYS, 10_000),
  /** Proxies in front of the service that append to X-Forwarded-For (Cloud Run: 1; Firebase Hosting in front: 2). */
  trustedProxyHops: num(process.env.TRUSTED_PROXY_HOPS, 1),
  maxBodyBytes: 2 * 1024 * 1024,
  /** Directory holding the product pages (copied from ../docs at build time). */
  siteDir: process.env.SITE_DIR,
  logging: process.env.CMT_LOG !== "off",
} as const;

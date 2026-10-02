/** Entry point: serve the app on PORT (default 8787). Cloud Run sends SIGTERM before stopping an instance. */
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { CONFIG, SERVICE } from "./config.js";
import { log } from "./log.js";
import { siteDir } from "./site.js";

const app = createApp();
const server = serve({ fetch: app.fetch, port: CONFIG.port, hostname: "0.0.0.0" }, (info) => {
  log({ event: "start", service: SERVICE.name, version: SERVICE.version, port: info.port, site: siteDir() ? "loaded" : "missing" });
});
const stop = () => server.close(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

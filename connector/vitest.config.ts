import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    env: { CMT_LOG: "off" },
    testTimeout: 20000,
  },
});

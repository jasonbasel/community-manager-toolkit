import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    env: { CMT_LOG: "off" },
    testTimeout: 20000,
    // Files run one at a time so the timing test (1,000 guests under 200 ms) is not measured under artificial CPU contention.
    fileParallelism: false,
  },
});

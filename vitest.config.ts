import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./test/database";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: "./test/global-setup.ts",
    env: { DATABASE_URL: TEST_DATABASE_URL },
    // Every test file shares one database, so files run one at a time.
    fileParallelism: false,
  },
});

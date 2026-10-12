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
    // No test reaches the exchange-rate, place-search or route-calculation
    // service: nothing answers at this address.
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      EXCHANGE_RATES_URL: "http://127.0.0.1:9",
      PLACE_SEARCH_URL: "http://127.0.0.1:9",
      ROUTE_CALCULATION_URL: "http://127.0.0.1:9",
      CRON_SECRET: "test-cron-secret",
    },
    // Every test file shares one database, so files run one at a time.
    fileParallelism: false,
  },
});

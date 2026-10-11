import { defineConfig, devices } from "@playwright/test";
import { TEST_DATABASE_URL } from "./test/database";

// Browser tests run against a production build on its own port, using the
// test database, so they disturb neither `npm run dev` nor development data.
const PORT = 3100;
// The place-search and route-calculation services are stood in for by
// e2e/place-search-stub.ts and e2e/route-calculation-stub.ts.
const PLACE_SEARCH_PORT = 3101;
const ROUTE_CALCULATION_PORT = 3102;

export default defineConfig({
  testDir: "./e2e",
  // Every test shares one database and one server.
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `tsx e2e/place-search-stub.ts ${PLACE_SEARCH_PORT}`,
      url: `http://127.0.0.1:${PLACE_SEARCH_PORT}`,
      reuseExistingServer: false,
    },
    {
      command: `tsx e2e/route-calculation-stub.ts ${ROUTE_CALCULATION_PORT}`,
      // It answers "bad request" to this, which says it is up.
      url: `http://127.0.0.1:${ROUTE_CALCULATION_PORT}`,
      reuseExistingServer: false,
    },
    {
      command: `tsx e2e/prepare-database.ts && next build && next start --port ${PORT}`,
      url: `http://localhost:${PORT}`,
      env: {
        DATABASE_URL: TEST_DATABASE_URL,
        // No test reaches the exchange-rate service: nothing answers at this address.
        EXCHANGE_RATES_URL: "http://127.0.0.1:9",
        PLACE_SEARCH_URL: `http://127.0.0.1:${PLACE_SEARCH_PORT}`,
        ROUTE_CALCULATION_URL: `http://127.0.0.1:${ROUTE_CALCULATION_PORT}`,
      },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});

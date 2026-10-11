import { defineConfig, devices } from "@playwright/test";
import { TEST_DATABASE_URL } from "./test/database";

// Browser tests run against a production build on its own port, using the
// test database, so they disturb neither `npm run dev` nor development data.
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  // Every test shares one database and one server.
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `tsx e2e/prepare-database.ts && next build && next start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: { DATABASE_URL: TEST_DATABASE_URL },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});

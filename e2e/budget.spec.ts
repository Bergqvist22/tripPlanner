import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { TEST_DATABASE_URL } from "../test/database";
import { field, saved, unlockedTrip } from "./support";

function budget(page: Page) {
  return page.getByRole("region", { name: "Budget", exact: true });
}

test("the Budget shows what the Trip costs and follows what the group decides", async ({ page }) => {
  // Four travellers, with the display currency SEK.
  const tripId = await unlockedTrip(page, ["Monterey"]);
  const { stops } = await (await page.request.get(`/api/trips/${tripId}/stops`)).json();
  const add = (item: Record<string, unknown>) => page.request.post(`/api/trips/${tripId}/items`, { data: item });
  await add({ category: "flight", title: "Stockholm to San Francisco", cost: 4500.5, costBasis: "per_person" });
  await add({
    category: "accommodation",
    title: "Monterey Bay Inn",
    stopId: stops[0].id,
    date: "2027-07-02",
    endDate: "2027-07-04",
    cost: 3200,
  });

  // Suggestions cost nothing yet, and are shown beside the Budget.
  await page.goto(`/trips/${tripId}`);
  await expect(budget(page)).toContainText("Nothing with a cost is Selected or Booked yet.");
  await expect(budget(page).getByRole("region", { name: "Suggestions" })).toContainText("SEK 21,202.00");
  await expect(budget(page).getByRole("region", { name: "By Category" })).toHaveCount(0);

  // Booking the flight puts four tickets in the Budget.
  const flight = page.getByRole("region", { name: "Flight" }).getByRole("listitem");
  let save = saved(page);
  await flight.getByRole("button", { name: "Booked", exact: true }).click();
  await save;
  await expect(budget(page).getByText("SEK 18,002.00").first()).toBeVisible();
  await expect(budget(page)).toContainText("Per personSEK 4,500.50");
  await expect(budget(page).getByRole("region", { name: "Suggestions" })).toContainText("SEK 3,200.00");

  // Selecting the Accommodation on its Stop's page reaches the Trip's Budget too.
  await page.getByRole("link", { name: /Monterey/ }).click();
  save = saved(page);
  await page.getByRole("listitem").filter({ hasText: "Monterey Bay Inn" }).getByRole("button", { name: "Selected" }).click();
  await save;
  await page.getByRole("link", { name: /^← / }).click();
  await expect(budget(page)).toContainText("TotalSEK 21,202.00");
  await expect(budget(page)).toContainText("Per personSEK 5,300.50");
  await expect(budget(page).getByRole("region", { name: "By Status" })).toHaveText(
    /Booked\s*SEK\s18,002\.00.*Selected\s*SEK\s3,200\.00/,
  );
  await expect(budget(page).getByRole("region", { name: "By Category" })).toHaveText(
    /Flight\s*SEK\s18,002\.00.*Accommodation\s*SEK\s3,200\.00/,
  );
  await expect(budget(page).getByRole("region", { name: "By Stop" })).toHaveText(
    /Monterey\s*SEK\s3,200\.00.*Whole Trip\s*SEK\s18,002\.00/,
  );
  await expect(budget(page).getByRole("region", { name: "Suggestions" })).toHaveCount(0);

  // Two travellers buy two tickets and split the room in two.
  save = saved(page);
  await field(page, "Travellers").fill("2");
  await save;
  await expect(budget(page)).toContainText("TotalSEK 12,201.00");
  await expect(budget(page)).toContainText("Per personSEK 6,100.50");
  await expect(budget(page)).toContainText("for 2 travellers");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the Budget fits the screen", async ({ page }) => {
    const tripId = await unlockedTrip(page);
    const added = await page.request.post(`/api/trips/${tripId}/items`, {
      data: { category: "car_rental", title: "Convertible", cost: 9_999_999_999.99, costBasis: "per_person" },
    });
    const { item } = await added.json();
    await page.request.patch(`/api/trips/${tripId}/items/${item.id}`, { data: { status: "booked" } });

    await page.goto(`/trips/${tripId}`);

    await expect(budget(page)).toContainText("SEK 39,999,999,999.96");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

// What one euro buys, as the exchange-rate service would have answered. The
// service itself is out of reach of the server under test.
async function knownRates(perEuro: Record<string, number>, fetchedAt: Date) {
  const database = new Client({ connectionString: TEST_DATABASE_URL });
  await database.connect();
  await database.query("TRUNCATE exchange_rates");
  for (const [currency, rate] of Object.entries(perEuro)) {
    await database.query("INSERT INTO exchange_rates (currency, per_euro, fetched_at) VALUES ($1, $2, $3)", [
      currency,
      rate,
      fetchedAt,
    ]);
  }
  await database.end();
}

// The other tests are written for a server that knows no rates.
test.afterEach(() => knownRates({}, new Date()));

test("an Item priced in another currency shows both prices and counts converted", async ({ page }) => {
  await knownRates({ EUR: 1, SEK: 10, USD: 1.25 }, new Date());
  // Four travellers, with the display currency SEK.
  const tripId = await unlockedTrip(page);
  const add = (item: Record<string, unknown>) => page.request.post(`/api/trips/${tripId}/items`, { data: item });
  const flight = await add({
    category: "flight",
    title: "Stockholm to San Francisco",
    cost: 500,
    currency: "USD",
    costBasis: "per_person",
  });
  await add({ category: "other", title: "Travel insurance", cost: 900 });
  const { item } = await flight.json();
  await page.request.patch(`/api/trips/${tripId}/items/${item.id}`, { data: { status: "booked" } });

  await page.goto(`/trips/${tripId}`);

  const items = page.getByRole("listitem");
  await expect(items.filter({ hasText: "Stockholm to San Francisco" })).toContainText(
    "USD 500.00 ≈ SEK 4,000.00 per person",
  );
  await expect(items.filter({ hasText: "Travel insurance" })).toContainText("SEK 900.00 total");
  await expect(items.filter({ hasText: "Travel insurance" })).not.toContainText("≈");
  await expect(budget(page)).toContainText("TotalSEK 16,000.00");
  await expect(budget(page)).not.toContainText("out of date");

  // In dollars the flight needs no converting and the insurance does.
  const save = saved(page);
  await field(page, "Display currency").selectOption("USD");
  await save;
  await expect(budget(page)).toContainText("TotalUSD 2,000.00");
  await expect(budget(page).getByRole("region", { name: "Suggestions" })).toContainText("USD 112.50");
  await expect(items.filter({ hasText: "Travel insurance" })).toContainText("SEK 900.00 ≈ USD 112.50 total");
});

test("the Budget says so when exchange rates may be out of date", async ({ page }) => {
  await knownRates({ EUR: 1, SEK: 10, USD: 1.25 }, new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
  const tripId = await unlockedTrip(page);
  const added = await page.request.post(`/api/trips/${tripId}/items`, {
    data: { category: "car_rental", title: "Convertible", cost: 100, currency: "USD" },
  });
  const { item } = await added.json();
  await page.request.patch(`/api/trips/${tripId}/items/${item.id}`, { data: { status: "booked" } });
  await page.request.post(`/api/trips/${tripId}/items`, {
    data: { category: "food", title: "Fish market", cost: 5000, currency: "ISK" },
  });

  await page.goto(`/trips/${tripId}`);

  await expect(budget(page)).toContainText("TotalSEK 800.00");
  await expect(budget(page)).toContainText("may be out of date");
  await expect(budget(page)).toContainText("No exchange rate is known for ISK");
});

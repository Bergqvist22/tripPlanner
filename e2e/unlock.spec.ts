import { expect, test, type Page } from "@playwright/test";

const password = "golden-gate";

async function createTrip(page: Page, name: string) {
  const response = await page.request.post("/api/trips", {
    data: { name, creatorName: "Emil", password, travellerCount: 4, displayCurrency: "SEK" },
  });
  const { trip } = await response.json();
  return trip.id as string;
}

test("a traveller unlocks a Trip and stays unlocked", async ({ page, context, browser }) => {
  const name = `California road trip ${Date.now()}`;
  const tripId = await createTrip(page, name);

  // Opening the Trip from the home page asks for its Trip password.
  await page.goto("/");
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByRole("heading", { name: "This Trip is locked" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Trip details" })).toHaveCount(0);

  // The wrong one gets a clear message and shows nothing.
  await page.getByLabel("Trip password").fill("alcatraz");
  await page.getByRole("button", { name: "Unlock Trip" }).click();
  await expect(page.getByText("That is not the Trip password. Try again.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Trip details" })).toHaveCount(0);

  // The right one shows the Trip.
  await page.getByLabel("Trip password").fill(password);
  await page.getByRole("button", { name: "Unlock Trip" }).click();
  await expect(page.getByRole("heading", { name: "Trip details" })).toBeVisible();
  await expect(page.getByLabel("Display currency")).toHaveValue("SEK");

  // It stays unlocked: on reload, in a new tab, and for months to come.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Trip details" })).toBeVisible();

  const tab = await context.newPage();
  await tab.goto(`/trips/${tripId}`);
  await expect(tab.getByRole("heading", { name: "Trip details" })).toBeVisible();

  const [unlock] = (await context.cookies()).filter((cookie) => cookie.name.includes(tripId));
  expect(unlock.httpOnly).toBe(true);
  expect(unlock.expires * 1000).toBeGreaterThan(Date.now() + 150 * 24 * 60 * 60 * 1000);
  expect(await tab.evaluate(() => document.cookie)).not.toContain(tripId);

  // Another Trip is still locked in this browser.
  const otherTripId = await createTrip(page, `Weekend in Oslo ${Date.now()}`);
  await tab.goto(`/trips/${otherTripId}`);
  await expect(tab.getByRole("heading", { name: "This Trip is locked" })).toBeVisible();

  // And this Trip is still locked in somebody else's browser.
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(`/trips/${tripId}`);
  await expect(stranger.getByRole("heading", { name: "This Trip is locked" })).toBeVisible();
});

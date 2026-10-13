import { expect, test, type Page } from "@playwright/test";
import { field } from "./support";

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
  await field(page, "Trip password").fill("alcatraz");
  await page.getByRole("button", { name: "Unlock Trip" }).click();
  await expect(page.getByText("That is not the Trip password. Try again.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Trip details" })).toHaveCount(0);

  // The right one shows the Trip.
  await field(page, "Trip password").fill(password);
  await page.getByRole("button", { name: "Unlock Trip" }).click();
  await expect(page.getByRole("heading", { name: "Trip details" })).toBeVisible();
  await expect(field(page, "Display currency")).toHaveValue("SEK");

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

test("a Trip created without a Trip password is open to everyone", async ({ page, browser }) => {
  const name = `Weekend in Oslo ${Date.now()}`;

  // The Trip password is left out when the Trip is created.
  await page.goto("/");
  await field(page, "Trip name").fill(name);
  await field(page, "Your name").fill("Emil");
  await page.getByRole("button", { name: "Create Trip" }).click();

  // The Trip opens without asking for one.
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { name: "Trip details" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "This Trip is locked" })).toHaveCount(0);

  // So it does in somebody else's browser, where it can be changed too.
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(page.url());
  await expect(stranger.getByRole("heading", { name: "Trip details" })).toBeVisible();
  await field(stranger, "New Stop").fill("Oslo");
  await stranger.getByRole("button", { name: "Add Stop" }).click();
  await expect(stranger.getByRole("region", { name: "Route" }).getByRole("listitem")).toHaveText([/Oslo/]);

  // Deleting it takes no Trip password, and asks first.
  await page.getByRole("button", { name: "Delete Trip" }).click();
  await expect(page.getByText(`Delete ${name} and everything in it?`)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Delete Trip" }).click();
  await page.getByRole("button", { name: "Yes, delete Trip permanently" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name })).toHaveCount(0);
});

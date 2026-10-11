import { expect, test, type Page } from "@playwright/test";
import { field, unlockedTrip } from "./support";

// The map's background is not what is tested, and its service is left alone.
test.beforeEach(({ page }) => page.route(/tile\.openstreetmap\.org/, (route) => route.abort()));

function map(page: Page) {
  return page.getByRole("group", { name: "Map of the Route" });
}

// The pins on the map, each named by its number on the Route and its Stop.
function pins(page: Page) {
  return map(page).locator(".leaflet-marker-icon");
}

async function pinNames(page: Page) {
  return pins(page).evaluateAll((icons) => icons.map((icon) => icon.getAttribute("title")));
}

// Searches for a place in the form being looked at and chooses the one found.
async function choosePlace(page: Page, search: string, label: string) {
  await field(page, "Place").fill(search);
  await page.getByRole("button", { name: label }).click();
}

async function addStop(page: Page, name: string) {
  await page.getByRole("button", { name: "Add Stop" }).click();
  await expect(page.getByRole("region", { name: "Route" }).getByRole("listitem").filter({ hasText: name })).toBeVisible();
}

test("a traveller searches for the place of each Stop and sees the Route on the map", async ({ page }) => {
  const tripId = await unlockedTrip(page);
  await page.goto(`/trips/${tripId}`);
  await expect(page.getByText("The Route is drawn here once it has Stops with a place.")).toBeVisible();
  await expect(map(page)).toHaveCount(0);

  // A Stop is named after the place found for it, unless it has a name already.
  await choosePlace(page, "san fran", "San Francisco, California, United States");
  await expect(field(page, "New Stop")).toHaveValue("San Francisco");
  await addStop(page, "San Francisco");
  await expect.poll(() => pinNames(page)).toEqual(["1. San Francisco"]);

  // A Stop without a place is on the Route but not on the map.
  await field(page, "New Stop").fill("Big Sur");
  await addStop(page, "Big Sur");
  await expect(page.getByText("1 Stop has no place yet and is not on the map.")).toBeVisible();

  await field(page, "New Stop").fill("LA");
  await choosePlace(page, "los", "Los Angeles, California, United States");
  await expect(field(page, "New Stop")).toHaveValue("LA");
  await addStop(page, "LA");
  await expect.poll(() => pinNames(page)).toEqual(["1. San Francisco", "3. LA"]);
  // One line joins the pins.
  await expect(map(page).locator(".leaflet-overlay-pane path")).toHaveCount(1);

  // A pin opens its Stop.
  await pins(page).nth(1).click();
  await map(page).getByRole("link", { name: "3. LA" }).click();
  await expect(page.getByRole("heading", { name: "LA", level: 1 })).toBeVisible();
  await expect(page.getByText("Los Angeles, California, United States")).toBeVisible();

  // Reordering the Route renumbers the pins.
  await page.getByRole("link", { name: /California road trip/ }).click();
  await page.getByRole("button", { name: "Move LA" }).press("ArrowUp");
  await expect.poll(() => pinNames(page)).toEqual(["1. San Francisco", "2. LA"]);
});

test("a place search that fails does not keep a Stop from being saved", async ({ page }) => {
  const tripId = await unlockedTrip(page, ["Monterey"]);
  await page.goto(`/trips/${tripId}`);
  await expect(page.getByText("No Stop has a place yet.")).toBeVisible();

  // Adding a Stop while the search is out of order.
  await field(page, "New Stop").fill("Somewhere");
  await field(page, "Place").fill("nowhere");
  await expect(page.getByText("Place search is not available right now.")).toBeVisible();
  await addStop(page, "Somewhere");

  // Editing one too: the rest of the Stop is saved as ever.
  await page.getByRole("link", { name: /Monterey/ }).click();
  await field(page, "Place").fill("nowhere");
  await expect(page.getByText("Place search is not available right now.").filter({ visible: true })).toBeVisible();
  await field(page, "Notes").fill("Aquarium opens at 10.");
  await expect(page.getByText("Saved.", { exact: true }).filter({ visible: true })).toBeVisible();

  // Once the search answers again the Stop is given its place, without a save button.
  await field(page, "Place").fill("atlantis");
  await expect(page.getByText("No place found for “atlantis”.")).toBeVisible();
  await choosePlace(page, "monterey", "Monterey, California, United States");
  await expect(page.getByText("Saved.", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Monterey, California, United States")).toBeVisible();
  await expect(field(page, "Notes")).toHaveValue("Aquarium opens at 10.");

  await page.getByRole("link", { name: /California road trip/ }).click();
  await expect.poll(() => pinNames(page)).toEqual(["1. Monterey"]);

  // Taking the place away takes the pin away.
  await page.getByRole("link", { name: /Monterey/ }).click();
  await page.getByRole("button", { name: "Remove place" }).filter({ visible: true }).click();
  await expect(page.getByText("Saved.", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole("link", { name: /California road trip/ }).click();
  await expect(page.getByText("No Stop has a place yet.").filter({ visible: true })).toBeVisible();
});

test("the map follows what a fellow traveller does to the only Stop with a place", async ({ page }) => {
  const tripId = await unlockedTrip(page, ["Monterey"]);
  const stopId = (await (await page.request.get(`/api/trips/${tripId}/stops`)).json()).stops[0].id as string;
  const monterey = { label: "Monterey, California, United States", latitude: 36.6002, longitude: -121.8947 };
  const givePlace = (place: typeof monterey | null) =>
    page.request.patch(`/api/trips/${tripId}/stops/${stopId}`, { data: { place } });
  const returnToTab = () => page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await givePlace(monterey);
  await page.goto(`/trips/${tripId}`);
  await expect.poll(() => pinNames(page)).toEqual(["1. Monterey"]);

  // The place is taken away and given back while this page stays open.
  await givePlace(null);
  await returnToTab();
  await expect(page.getByText("No Stop has a place yet.")).toBeVisible();
  await expect(map(page)).toHaveCount(0);

  await givePlace(monterey);
  await returnToTab();
  await expect.poll(() => pinNames(page)).toEqual(["1. Monterey"]);
});

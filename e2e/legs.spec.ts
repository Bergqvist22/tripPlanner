import { expect, test, type Page } from "@playwright/test";
import { unlockedTrip } from "./support";

// The map's background is not what is tested, and its service is left alone.
test.beforeEach(({ page }) => page.route(/tile\.openstreetmap\.org/, (route) => route.abort()));

const places = {
  "San Francisco": { latitude: 37.7793, longitude: -122.4193 },
  Monterey: { latitude: 36.6002, longitude: -121.8947 },
  "Los Angeles": { latitude: 34.0537, longitude: -118.2428 },
};

// A Trip through these places, each Stop with its place on the map.
async function tripThrough(page: Page, ...names: (keyof typeof places)[]) {
  const tripId = await unlockedTrip(page);
  for (const name of names) {
    await page.request.post(`/api/trips/${tripId}/stops`, {
      data: { name, place: { label: `${name}, California, United States`, ...places[name] } },
    });
  }
  return tripId;
}

// The Leg between two Stops, closed and opened.
function leg(page: Page, from: string, to: string) {
  const name = `Leg from ${from} to ${to}`;
  return { summary: page.getByLabel(name).first(), opened: page.getByRole("group", { name }) };
}

function travelTime(page: Page) {
  return page.locator("dt", { hasText: "Travel time" }).locator("+ dd");
}

function linesOnMap(page: Page) {
  return page.getByRole("group", { name: "Map of the Route" }).locator(".leaflet-overlay-pane path");
}

test("a traveller sees how long each Leg takes and sets what the calculation cannot know", async ({ page }) => {
  const tripId = await tripThrough(page, "San Francisco", "Monterey", "Los Angeles");
  await page.goto(`/trips/${tripId}`);

  // Each Leg is a Drive until told otherwise, with a calculated time and distance.
  const north = leg(page, "San Francisco", "Monterey");
  const south = leg(page, "Monterey", "Los Angeles");
  await expect(north.summary).toContainText("Drive · 2 h 5 min · 190 km");
  await expect(south.summary).toContainText("Drive · 2 h 5 min · 190 km");
  await expect(travelTime(page)).toHaveText("4 h 10 min");
  await expect(linesOnMap(page)).toHaveCount(2);

  // A scenic drive takes longer than calculated: the time is set by hand, and marked so.
  await north.summary.click();
  await north.opened.getByLabel("h", { exact: true }).fill("3");
  await north.opened.getByLabel("min", { exact: true }).fill("30");
  await north.opened.getByLabel("min", { exact: true }).blur();
  await expect(north.summary).toContainText("Drive · 3 h 30 min · 190 km");
  await expect(north.summary).toContainText("Set by hand");
  await expect(travelTime(page)).toHaveText("5 h 35 min");

  // And it can go back to the calculated one.
  await north.opened.getByRole("button", { name: "Use the calculated 2 h 5 min" }).click();
  await expect(north.summary).toContainText("Drive · 2 h 5 min · 190 km");
  await expect(north.summary).not.toContainText("Set by hand");

  // The second Leg is flown, so nothing is calculated for it.
  await south.summary.click();
  await south.opened.getByLabel("Travel mode").selectOption("Flight");
  await expect(south.summary).toContainText("Flight · no travel time yet");
  await expect(travelTime(page)).toHaveText("2 h 5 min and 1 Leg without a travel time");
  await south.opened.getByLabel("h", { exact: true }).fill("1");
  await south.opened.getByLabel("min", { exact: true }).fill("25");
  await south.opened.getByLabel("min", { exact: true }).press("Enter");
  await expect(south.summary).toContainText("Flight · 1 h 25 min");
  await expect(south.summary).not.toContainText("Set by hand");
  await expect(travelTime(page)).toHaveText("3 h 30 min");

  // What was set is kept, and both Legs are still on the map.
  await page.reload();
  await expect(leg(page, "Monterey", "Los Angeles").summary).toContainText("Flight · 1 h 25 min");
  await expect(linesOnMap(page)).toHaveCount(2);

  // Reordering the Route makes new Legs, and brings the flight back with its pair.
  await page.getByRole("button", { name: "Move Los Angeles" }).press("ArrowUp");
  await expect(leg(page, "San Francisco", "Los Angeles").summary).toContainText("Drive · 2 h 5 min");
  await expect(leg(page, "Los Angeles", "Monterey").summary).toContainText("Drive · 2 h 5 min");
  await expect(travelTime(page)).toHaveText("4 h 10 min");
  await page.getByRole("button", { name: "Move Los Angeles" }).press("ArrowDown");
  await expect(leg(page, "Monterey", "Los Angeles").summary).toContainText("Flight · 1 h 25 min");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("a Leg is changed without the page growing wider than the screen", async ({ page }) => {
    const tripId = await tripThrough(page, "San Francisco", "Monterey");
    await page.goto(`/trips/${tripId}`);

    const only = leg(page, "San Francisco", "Monterey");
    await only.summary.tap();
    await only.opened.getByLabel("Travel mode").selectOption("Ferry");
    await expect(only.summary).toContainText("Ferry · no travel time yet");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

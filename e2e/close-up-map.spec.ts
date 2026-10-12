import { expect, test, type Page } from "@playwright/test";
import { field, itemList, saved, unlockedTrip } from "./support";

// The map's background is not what is tested, and its service is left alone.
test.beforeEach(({ page }) => page.route(/tile\.openstreetmap\.org/, (route) => route.abort()));

const canneryRow = "Cannery Row, Monterey, California, United States";
const wharf = "Old Fisherman's Wharf, Monterey, California, United States";

function map(page: Page) {
  return page.getByRole("group", { name: "Map of the Items" });
}

// The pins on the map, each named by its Item, Category and Status.
function pins(page: Page) {
  return map(page).locator(".leaflet-marker-icon");
}

function pin(page: Page, title: string) {
  return map(page).getByTitle(title, { exact: true });
}

async function pinNames(page: Page) {
  return (await pins(page).evaluateAll((icons) => icons.map((icon) => icon.getAttribute("title")))).sort();
}

// How a pin is drawn: its colour, and how strongly.
function drawn(page: Page, title: string) {
  return pin(page, title).evaluate((icon) => {
    const { backgroundColor, opacity } = getComputedStyle(icon);
    return { colour: backgroundColor, opacity: Number(opacity) };
  });
}

// Searches for a place in the form being looked at and chooses the one found.
async function choosePlace(page: Page, search: string, label: string) {
  await field(page, "Place").fill(search);
  await page.getByRole("button", { name: label }).click();
}

function card(page: Page, title: string) {
  return itemList(page).getByRole("listitem").filter({ hasText: title });
}

test("a traveller gives Items a place and sees them on the close-up map of their Stop", async ({ page }) => {
  const tripId = await unlockedTrip(page, ["Monterey"]);
  await page.goto(`/trips/${tripId}`);
  await page.getByRole("link", { name: /Monterey/ }).click();
  await expect(page.getByText("Items are shown here once they have a place.")).toBeVisible();
  await expect(map(page)).toHaveCount(0);

  // A new Item is given a place found by searching for it.
  await page.getByRole("link", { name: "Add Item" }).click();
  await field(page, "Category").selectOption("Activity");
  await field(page, "Title").fill("Aquarium");
  await choosePlace(page, "cannery", canneryRow);
  await expect(page.getByText(canneryRow).filter({ visible: true })).toBeVisible();
  await page.getByRole("button", { name: "Add Item" }).click();
  await expect.poll(() => pinNames(page)).toEqual(["Aquarium · Activity · Suggestion"]);

  // One without a place is on the list but not on the map, until it is given one.
  await page.getByRole("link", { name: "Add Item" }).click();
  await field(page, "Category").selectOption("Food");
  await field(page, "Title").fill("Chowder");
  await page.getByRole("button", { name: "Add Item" }).click();
  await expect(card(page, "Chowder")).toBeVisible();
  await expect(pins(page)).toHaveCount(1);

  await itemList(page).getByRole("link", { name: "Chowder" }).click();
  await expect(page.getByRole("heading", { name: "Chowder", level: 1 })).toBeVisible();
  await choosePlace(page, "wharf", wharf);
  await expect(page.getByText("Saved.", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole("link", { name: /Monterey/ }).click();
  await expect
    .poll(() => pinNames(page))
    .toEqual(["Aquarium · Activity · Suggestion", "Chowder · Food · Suggestion"]);

  // Pins are coloured by Category, and the map says which colour is which.
  const aquarium = await drawn(page, "Aquarium · Activity · Suggestion");
  const chowder = await drawn(page, "Chowder · Food · Suggestion");
  expect(aquarium.colour).not.toBe(chowder.colour);
  await expect(page.getByRole("list", { name: "Pin colours" }).getByRole("listitem")).toHaveText([
    "Activity",
    "Food",
    "Dimmed: Suggestion",
  ]);

  // A Suggestion is dimmed next to what the group has decided on.
  expect(aquarium.opacity).toBeLessThan(1);
  let stored = saved(page);
  await card(page, "Aquarium").getByRole("button", { name: "Booked", exact: true }).click();
  await stored;
  await expect.poll(() => pinNames(page)).toContain("Aquarium · Activity · Booked");
  expect((await drawn(page, "Aquarium · Activity · Booked")).opacity).toBe(1);
  expect((await drawn(page, "Chowder · Food · Suggestion")).opacity).toBeLessThan(1);

  // A Rejected Item leaves the map, and is back while Rejected Items are shown.
  stored = saved(page);
  await card(page, "Chowder").getByRole("button", { name: "Rejected", exact: true }).click();
  await stored;
  await expect.poll(() => pinNames(page)).toEqual(["Aquarium · Activity · Booked"]);
  await page.getByRole("button", { name: "Show 1 Rejected" }).click();
  await expect
    .poll(() => pinNames(page))
    .toEqual(["Aquarium · Activity · Booked", "Chowder · Food · Rejected"]);
  await page.getByRole("button", { name: "Hide 1 Rejected" }).click();
  await expect.poll(() => pinNames(page)).toEqual(["Aquarium · Activity · Booked"]);

  // Selecting a pin shows which Item it is, and opens it.
  await pin(page, "Aquarium · Activity · Booked").click();
  await expect(map(page).getByText("Activity · Booked")).toBeVisible();
  await expect(map(page).getByText(canneryRow)).toBeVisible();
  await map(page).getByRole("link", { name: "Aquarium" }).click();
  await expect(page.getByRole("heading", { name: "Aquarium", level: 1 })).toBeVisible();

  // Taking the place away takes the pin away.
  await page.getByRole("button", { name: "Remove place" }).filter({ visible: true }).click();
  await expect(page.getByText("Saved.", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole("link", { name: /Monterey/ }).click();
  await expect(page.getByText("Every Item with a place is Rejected.").filter({ visible: true })).toBeVisible();
});

test("the overview map shows the Stop, not its Items", async ({ page }) => {
  const tripId = await unlockedTrip(page, ["Monterey"]);
  const stopId = (await (await page.request.get(`/api/trips/${tripId}/stops`)).json()).stops[0].id as string;
  await page.request.patch(`/api/trips/${tripId}/stops/${stopId}`, {
    data: { place: { label: "Monterey, California, United States", latitude: 36.6002, longitude: -121.8947 } },
  });
  await page.request.post(`/api/trips/${tripId}/items`, {
    data: {
      stopId,
      category: "activity",
      title: "Aquarium",
      place: { label: canneryRow, latitude: 36.6159, longitude: -121.9006 },
    },
  });

  await page.goto(`/trips/${tripId}`);

  const overview = page.getByRole("group", { name: "Map of the Route" }).locator(".leaflet-marker-icon");
  await expect(overview).toHaveCount(1);
  await expect(overview).toHaveAttribute("title", "1. Monterey");
});

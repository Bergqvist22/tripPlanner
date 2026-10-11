import { expect, test, type Page } from "@playwright/test";
import { field, unlockedTrip } from "./support";

// A Trip with one Stop and one Item on it, as a fellow traveller would reach
// them: through the server, without this page knowing.
async function sharedTrip(page: Page) {
  const tripId = await unlockedTrip(page, ["Monterey"]);
  const stopId = (await (await page.request.get(`/api/trips/${tripId}/stops`)).json()).stops[0].id as string;
  const added = await page.request.post(`/api/trips/${tripId}/items`, {
    data: { category: "activity", title: "Aquarium", stopId },
  });
  const itemId = (await added.json()).item.id as string;
  const itemAddress = `/api/trips/${tripId}/items/${itemId}`;
  return { tripId, stopId, itemId, itemAddress };
}

// What happens when the traveller comes back to the tab.
function returnToTab(page: Page) {
  return page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

function saveStatus(page: Page, text: string) {
  return page.getByText(text, { exact: true }).filter({ visible: true });
}

// Saves to this address no longer reach the server.
function loseConnection(page: Page, address: string) {
  return page.route(`**${address}`, (route) => (route.request().method() === "PATCH" ? route.abort() : route.continue()));
}

test("two travellers edit different fields of the same Item and both keep their change", async ({ page }) => {
  const { tripId, itemId, itemAddress } = await sharedTrip(page);
  await page.goto(`/trips/${tripId}/items/${itemId}`);
  await expect(field(page, "Title")).toHaveValue("Aquarium");

  // A fellow traveller renames the Item while this page is open on it.
  await page.request.patch(itemAddress, { data: { title: "Monterey Bay Aquarium", cost: 450 } });

  // Typing notes here is saved without a save button, and sends the notes alone.
  await field(page, "Notes").fill("Opens at 10.");
  await expect(saveStatus(page, "Saved.")).toBeVisible();
  const { item } = await (await page.request.get(itemAddress)).json();
  expect(item).toMatchObject({ title: "Monterey Bay Aquarium", cost: 450, notes: "Opens at 10." });

  // What is typed stays as typed, also where the server stores it differently.
  await field(page, "Booking reference").fill("AQ-1 ");
  await expect(saveStatus(page, "Saved.")).toBeVisible();
  expect((await (await page.request.get(itemAddress)).json()).item.bookingReference).toBe("AQ-1");
  await expect(field(page, "Booking reference")).toHaveValue("AQ-1 ");

  // The page now shows the fellow traveller's change too.
  await expect(page.getByRole("heading", { name: "Monterey Bay Aquarium", level: 1 })).toBeVisible();
  await expect(field(page, "Title")).toHaveValue("Monterey Bay Aquarium");
  await expect(field(page, "Cost", { exact: true })).toHaveValue("450");
});

test("a Trip is refetched when the traveller returns to the tab", async ({ page }) => {
  const { tripId, stopId, itemId, itemAddress } = await sharedTrip(page);
  await page.goto(`/trips/${tripId}`);
  await expect(page.getByRole("link", { name: /Monterey/ })).toBeVisible();

  // Meanwhile a fellow traveller adds a Stop.
  await page.request.post(`/api/trips/${tripId}/stops`, { data: { name: "Los Angeles" } });
  await returnToTab(page);
  await expect(page.getByRole("link", { name: /Los Angeles/ })).toBeVisible();

  // On a Stop's page, its details and its Items follow.
  await page.getByRole("link", { name: /Monterey/ }).click();
  await expect(field(page, "Stop name")).toHaveValue("Monterey");
  await page.request.patch(`/api/trips/${tripId}/stops/${stopId}`, { data: { notes: "Aquarium opens at 10." } });
  await page.request.patch(itemAddress, { data: { title: "Monterey Bay Aquarium" } });
  await returnToTab(page);
  await expect(field(page, "Notes")).toHaveValue("Aquarium opens at 10.");
  await expect(page.getByRole("link", { name: "Monterey Bay Aquarium" })).toBeVisible();

  // On an Item's page, a field being edited keeps what was typed in it.
  await page.goto(`/trips/${tripId}/items/${itemId}`);
  await loseConnection(page, itemAddress);
  await field(page, "Notes").fill("Book ahead.");
  await page.request.patch(itemAddress, { data: { title: "The aquarium", notes: "Closed on Mondays." } });
  await returnToTab(page);
  await expect(field(page, "Title")).toHaveValue("The aquarium");
  await expect(field(page, "Notes")).toHaveValue("Book ahead.");
});

test("a save that fails is shown, and is not called saved", async ({ page }) => {
  const { tripId, stopId } = await sharedTrip(page);
  const stopAddress = `/api/trips/${tripId}/stops/${stopId}`;
  await page.goto(`/trips/${tripId}/stops/${stopId}`);

  await loseConnection(page, stopAddress);
  await field(page, "Stop name").fill("Monterey Bay");
  await field(page, "Stop name").blur();
  await expect(page.getByRole("alert").filter({ hasText: "Your changes are not saved." })).toBeVisible();
  await expect(saveStatus(page, "Saved.")).toHaveCount(0);
  // The page still says what is stored.
  await expect(page.getByRole("heading", { name: "Monterey", level: 1 })).toBeVisible();
  expect((await (await page.request.get(stopAddress)).json()).stop.name).toBe("Monterey");

  // Once it is back, trying again saves what was typed.
  await page.unroute(`**${stopAddress}`);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(saveStatus(page, "Saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Monterey Bay", level: 1 })).toBeVisible();
  expect((await (await page.request.get(stopAddress)).json()).stop.name).toBe("Monterey Bay");
});

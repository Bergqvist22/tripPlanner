import { expect, test, type Page } from "@playwright/test";
import { unlockedTrip } from "./support";

function route(page: Page) {
  return page.getByRole("region", { name: "Route" }).getByRole("listitem");
}

function recentlyDeleted(page: Page) {
  return page.getByRole("region", { name: "Recently deleted" }).filter({ visible: true });
}

test("a deleted Stop and a deleted Item are restored from Recently deleted", async ({ page }) => {
  const tripId = await unlockedTrip(page, ["San Francisco", "Monterey", "Los Angeles"]);
  const { stops } = await (await page.request.get(`/api/trips/${tripId}/stops`)).json();
  const stopId = stops[1].id as string;
  for (const title of ["Aquarium", "Whale watching"]) {
    await page.request.post(`/api/trips/${tripId}/items`, { data: { category: "activity", title, stopId } });
  }

  // Nothing is deleted yet.
  await page.goto(`/trips/${tripId}`);
  await expect(route(page)).toHaveText([/San Francisco/, /Monterey/, /Los Angeles/]);
  await expect(page.getByRole("region", { name: "Recently deleted" })).toHaveCount(0);

  // Deleting a Stop says what goes with it and that it can be undone.
  await page.getByRole("link", { name: /Monterey/ }).click();
  await page.getByRole("button", { name: "Delete Stop" }).click();
  await expect(
    page.getByText("Its 2 Items are deleted with it. You can restore it from Recently deleted for 30 days."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Yes, delete Stop" }).click();
  await expect(route(page)).toHaveText([/San Francisco/, /Los Angeles/]);

  // The Stop is listed with its Items, and restoring it brings all of it back.
  await expect(recentlyDeleted(page).getByRole("listitem")).toHaveText([
    /Monterey.*Stop · with its 2 Items.*Deleted less than a day ago · 30 days left/,
  ]);
  await page.getByRole("button", { name: "Restore Monterey" }).click();
  await expect(route(page)).toHaveText([/San Francisco/, /Monterey/, /Los Angeles/]);
  await expect(page.getByRole("region", { name: "Recently deleted" })).toHaveCount(0);

  // An Item deleted on its own is listed with where it goes back to.
  await page.getByRole("link", { name: /Monterey/ }).click();
  await page.getByRole("link", { name: "Aquarium" }).first().click();
  await page.getByRole("button", { name: "Delete Item" }).click();
  await expect(
    page.getByText("You can restore it from Recently deleted for 30 days.", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Yes, delete Item" }).click();
  await expect(page.getByRole("heading", { name: "Monterey", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Aquarium" })).toHaveCount(0);

  await page.goto(`/trips/${tripId}`);
  await expect(recentlyDeleted(page).getByRole("listitem")).toHaveText([/Aquarium.*Activity · At Monterey/]);
  await page.getByRole("button", { name: "Restore Aquarium" }).click();
  await expect(page.getByRole("region", { name: "Recently deleted" })).toHaveCount(0);
  await page.getByRole("link", { name: /Monterey/ }).click();
  await expect(page.getByRole("link", { name: "Aquarium" }).first()).toBeVisible();
});

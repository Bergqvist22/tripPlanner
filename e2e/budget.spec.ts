import { expect, test, type Page } from "@playwright/test";
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
  await field(page, "Travellers").fill("2");
  save = saved(page);
  await page.getByRole("button", { name: "Save changes" }).click();
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

import { expect, test } from "@playwright/test";
import { unlockedTrip } from "./support";

test("the group is warned about nights without a bed until an Accommodation is decided on", async ({ page }) => {
  const tripId = await unlockedTrip(page);
  const added = await page.request.post(`/api/trips/${tripId}/stops`, {
    data: { name: "Monterey", arrivalDate: "2027-07-02", departureDate: "2027-07-04" },
  });
  const stopId = (await added.json()).stop.id as string;
  await page.request.post(`/api/trips/${tripId}/items`, {
    data: { category: "accommodation", title: "Monterey Bay Inn", stopId, date: "2027-07-02", endDate: "2027-07-05" },
  });

  // The Trip page sums the warnings up, and each leads to its Stop.
  await page.goto(`/trips/${tripId}`);
  const summary = page.getByRole("region", { name: "Warnings" }).filter({ visible: true });
  await expect(summary.getByRole("listitem")).toHaveText([
    /Monterey has 2 nights without Accommodation: the nights of 2 Jul 2027 – 3 Jul 2027\./,
  ]);
  await summary.getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Monterey", level: 1 })).toBeVisible();

  // The Stop tells each night. A Suggestion covers none of them.
  const warnings = page.getByRole("region", { name: "Warnings" }).filter({ visible: true });
  await expect(warnings.getByRole("listitem")).toHaveText([
    "No Accommodation for the night of 2 Jul 2027.",
    "No Accommodation for the night of 3 Jul 2027.",
  ]);

  // Once it is Selected the nights are covered, but it runs past the Stop's dates.
  await page.getByRole("button", { name: "Selected", exact: true }).click();
  await expect(warnings.getByRole("listitem")).toHaveText([
    "Monterey Bay Inn (2 Jul 2027 – 5 Jul 2027) is outside the dates of Monterey.",
  ]);

  // With the Stop's dates put right there is nothing left to warn about.
  await page.request.patch(`/api/trips/${tripId}/stops/${stopId}`, { data: { departureDate: "2027-07-05" } });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Monterey", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Warnings" })).toHaveCount(0);
});

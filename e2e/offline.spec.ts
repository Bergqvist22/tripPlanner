import { expect, test, type Page } from "@playwright/test";
import { field, unlockedTrip } from "./support";

function notice(page: Page) {
  return page.getByRole("status").filter({ hasText: "Offline copy" });
}

// Resolves once the device holds the Trip's offline copy and the offline
// reader, and the service worker answers for the page.
async function keptOffline(page: Page, tripId: string) {
  await expect
    .poll(() =>
      page.evaluate(
        async (name) =>
          localStorage.getItem(name) !== null &&
          navigator.serviceWorker.controller !== null &&
          (await (await caches.open("offline-reader")).match("/offline")) !== undefined,
        `trip-offline-copy:${tripId}`,
      ),
    )
    .toBe(true);
}

test("a Trip that was loaded is read without a connection, and edited again with one", async ({ page, context }) => {
  const tripId = await unlockedTrip(page);
  const added = await page.request.post(`/api/trips/${tripId}/stops`, {
    data: { name: "Monterey", arrivalDate: "2027-07-02", departureDate: "2027-07-04", notes: "Park behind the inn" },
  });
  const stopId = (await added.json()).stop.id as string;
  await page.request.post(`/api/trips/${tripId}/stops`, { data: { name: "Los Angeles" } });
  await page.request.post(`/api/trips/${tripId}/items`, {
    data: {
      category: "accommodation",
      title: "Monterey Bay Inn",
      stopId,
      date: "2027-07-02",
      endDate: "2027-07-04",
      cost: 3000,
      place: { label: "242 Cannery Row, Monterey", latitude: 36.61, longitude: -121.9 },
      link: "https://example.com/inn",
      bookingReference: "MBI-4711",
      notes: "Late check-in arranged",
    },
  });
  await page.request.post(`/api/trips/${tripId}/items`, { data: { category: "flight", title: "Flight out" } });

  // With a connection the Trip is the Trip: nothing says offline, and it can be edited.
  await page.goto(`/trips/${tripId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/California road trip/);
  await expect(notice(page)).toHaveCount(0);
  await expect(field(page, "Trip name")).toBeEditable();
  await keptOffline(page, tripId);

  // The connection is lost: the page gives way to the offline copy, marked as
  // one, with its age and why nothing can be edited.
  await context.setOffline(true);
  await expect(page.getByRole("status").filter({ hasText: "You are offline." })).toBeVisible();
  await expect(notice(page)).toContainText("loaded less than a minute ago", { timeout: 10_000 });
  await expect(notice(page)).toContainText("Editing is off while you are offline");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/California road trip/);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  const route = page.getByRole("region", { name: "Route" });
  await expect(route.getByRole("link")).toHaveText([/Monterey.*2 Jul 2027 – 4 Jul 2027 · 2 nights · 1 Item/, /Los Angeles/]);
  await expect(page.getByRole("region", { name: "Items for the whole Trip" })).toContainText("Flight out");

  // A Stop is opened and read, with all there is to know about its Items.
  await route.getByRole("link", { name: /Monterey/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Monterey");
  await expect(page.getByText("Park behind the inn")).toBeVisible();
  const inn = page.getByRole("region", { name: "Items" }).getByRole("listitem");
  await expect(inn).toContainText("Monterey Bay Inn");
  await expect(inn).toContainText("Accommodation · Suggestion");
  await expect(inn).toContainText("242 Cannery Row, Monterey");
  await expect(inn).toContainText("MBI-4711");
  await expect(inn).toContainText("Late check-in arranged");
  await expect(inn.getByRole("link", { name: "https://example.com/inn" })).toBeVisible();

  // So is a page opened afresh, as from a bookmark, and it is still offline.
  await page.goto(`/trips/${tripId}/stops/${stopId}`);
  await expect(notice(page)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Monterey");
  await page.getByRole("link", { name: /California road trip/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/California road trip/);
  await page.getByRole("button", { name: "Try the connection again" }).click();
  await expect(notice(page)).toBeVisible();

  // The connection returns: the Trip is loaded again and can be edited.
  await context.setOffline(false);
  await expect(notice(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/California road trip/);
  await expect(field(page, "Trip name")).toBeEditable();
});

test("a Trip never loaded on the device has nothing to read offline", async ({ page, context }) => {
  const tripId = await unlockedTrip(page);
  await page.goto(`/trips/${tripId}`);
  await keptOffline(page, tripId);

  await context.setOffline(true);
  await page.goto("/trips/00000000-0000-4000-8000-000000000000");

  await expect(page.getByRole("status")).toContainText("Nothing to read offline");
});

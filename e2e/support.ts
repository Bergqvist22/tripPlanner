import type { Page } from "@playwright/test";

// The field with this label on the page being looked at. A page that was left
// stays in the document, hidden, and its fields are not the ones meant.
export function field(page: Page, label: string, options?: { exact?: boolean }) {
  return page.getByLabel(label, options).filter({ visible: true });
}

// The Items of the Stop or of the whole Trip as a list by Category, on the page
// being looked at. They are listed day by day as well, by title alone.
export function itemList(page: Page) {
  return page.getByRole("region", { name: /^Items( for the whole Trip)?$/ }).filter({ visible: true });
}

// Resolves once a change made on the page has been saved.
export function saved(page: Page) {
  return page.waitForResponse((response) => response.request().method() === "PATCH" && response.ok());
}

const password = "golden-gate";

// A Trip with these Stops, already unlocked in the page's browser.
export async function unlockedTrip(page: Page, stopNames: string[] = []) {
  const created = await page.request.post("/api/trips", {
    data: {
      name: `California road trip ${Date.now()}`,
      creatorName: "Emil",
      password,
      travellerCount: 4,
      displayCurrency: "SEK",
    },
  });
  const tripId = (await created.json()).trip.id as string;
  await page.request.post(`/api/trips/${tripId}/unlock`, { data: { password } });
  for (const name of stopNames) {
    await page.request.post(`/api/trips/${tripId}/stops`, { data: { name } });
  }
  return tripId;
}

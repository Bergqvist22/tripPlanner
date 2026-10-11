import type { Page } from "@playwright/test";

// The field with this label on the page being looked at. A page that was left
// stays in the document, hidden, and its fields are not the ones meant.
export function field(page: Page, label: string, options?: { exact?: boolean }) {
  return page.getByLabel(label, options).filter({ visible: true });
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

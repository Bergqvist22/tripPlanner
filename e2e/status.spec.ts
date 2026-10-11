import { expect, test, type Locator, type Page } from "@playwright/test";
import { unlockedTrip } from "./support";

// A Trip with three Accommodations to choose between in Monterey, opened on that Stop's page.
async function stopWithSuggestions(page: Page) {
  const tripId = await unlockedTrip(page, ["Monterey"]);
  const { stops } = await (await page.request.get(`/api/trips/${tripId}/stops`)).json();
  const inMonterey = { category: "accommodation", stopId: stops[0].id, date: "2027-07-02", endDate: "2027-07-04" };
  for (const item of [
    { title: "Monterey Bay Inn", cost: 3200, currency: "USD", link: "https://inn.example/rooms" },
    { title: "Cannery Row Hostel", cost: 900, currency: "USD", link: "https://hostel.example" },
    { title: "Cabin in the pines", cost: 2100, currency: "USD", link: "https://cabins.example/7" },
  ]) {
    await page.request.post(`/api/trips/${tripId}/items`, { data: { ...inMonterey, ...item } });
  }
  await page.goto(`/trips/${tripId}/stops/${stops[0].id}`);
  return tripId;
}

function accommodations(page: Page) {
  return page.getByRole("region", { name: "Accommodation" }).getByRole("listitem");
}

function status(item: Locator, name: string) {
  return item.getByRole("button", { name, exact: true });
}

function statusSaved(page: Page) {
  return page.waitForResponse((response) => response.request().method() === "PATCH" && response.ok());
}

// How the Item's card is drawn: dashed for a Suggestion, solid once decided on.
function outline(item: Locator) {
  return expect.poll(() => item.evaluate((card) => getComputedStyle(card).borderTopStyle));
}

test("the group compares Suggestions and records what it decided", async ({ page }) => {
  await stopWithSuggestions(page);

  // Every new Item is a Suggestion, shown with its price and link.
  await expect(accommodations(page)).toHaveText([/Monterey Bay Inn/, /Cannery Row Hostel/, /Cabin in the pines/]);
  for (const item of await accommodations(page).all()) {
    await expect(status(item, "Suggestion")).toHaveAttribute("aria-pressed", "true");
    await expect(item).toContainText(/USD\s[\d,]+\.00 total/);
    await expect(item.getByRole("link", { name: /\.example/ })).toBeVisible();
    await outline(item).toBe("dashed");
  }

  // One tap marks an Item as Selected, and it no longer looks like a Suggestion.
  const hostel = accommodations(page).filter({ hasText: "Cannery Row Hostel" });
  let saved = statusSaved(page);
  await status(hostel, "Selected").click();
  await expect(status(hostel, "Selected")).toHaveAttribute("aria-pressed", "true");
  await expect(status(hostel, "Suggestion")).toHaveAttribute("aria-pressed", "false");
  await saved;
  await outline(hostel).toBe("solid");
  // What is decided comes first; the Suggestions stay next to each other.
  await expect(accommodations(page)).toHaveText([/Cannery Row Hostel/, /Monterey Bay Inn/, /Cabin in the pines/]);

  // A second Item in the same Stop and Category can be decided on as well.
  const inn = accommodations(page).filter({ hasText: "Monterey Bay Inn" });
  saved = statusSaved(page);
  await status(inn, "Booked").click();
  await saved;
  await expect(status(inn, "Booked")).toHaveAttribute("aria-pressed", "true");
  await expect(status(hostel, "Selected")).toHaveAttribute("aria-pressed", "true");
  await outline(inn).toBe("solid");

  // A Rejected Item is out of the way, but can be shown and brought back.
  const cabin = accommodations(page).filter({ hasText: "Cabin in the pines" });
  saved = statusSaved(page);
  await status(cabin, "Rejected").click();
  await saved;
  await expect(cabin).toHaveCount(0);
  await page.reload();
  await expect(accommodations(page)).toHaveText([/Monterey Bay Inn/, /Cannery Row Hostel/]);
  await page.getByRole("button", { name: "Show 1 Rejected" }).click();
  await expect(accommodations(page)).toHaveText([/Monterey Bay Inn/, /Cannery Row Hostel/, /Cabin in the pines/]);
  await expect(status(cabin, "Rejected")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Hide 1 Rejected" }).click();
  await expect(cabin).toHaveCount(0);

  await page.getByRole("button", { name: "Show 1 Rejected" }).click();
  saved = statusSaved(page);
  await status(cabin, "Suggestion").click();
  await saved;
  await expect(page.getByRole("button", { name: /Rejected$/ }).filter({ hasText: /Show|Hide/ })).toHaveCount(0);
  await expect(accommodations(page)).toHaveCount(3);

  // The next Item to be Rejected is hidden again, although the last one was being shown.
  saved = statusSaved(page);
  await status(cabin, "Rejected").click();
  await saved;
  await expect(page.getByRole("button", { name: "Show 1 Rejected" })).toBeVisible();
  await expect(cabin).toHaveCount(0);

  // The Status is also shown and changed on the Item's own page.
  await inn.getByRole("link", { name: "Monterey Bay Inn" }).click();
  await expect(page.getByText("Accommodation · Booked · At Monterey")).toBeVisible();
  const own = page.getByRole("group", { name: "Status of Monterey Bay Inn" });
  saved = statusSaved(page);
  await own.getByRole("button", { name: "Selected" }).click();
  await saved;
  await expect(page.getByText("Accommodation · Selected · At Monterey")).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a Status is changed with one tap and fits the screen", async ({ page }) => {
    await stopWithSuggestions(page);
    const inn = accommodations(page).filter({ hasText: "Monterey Bay Inn" });

    const saved = statusSaved(page);
    await status(inn, "Booked").tap();
    await saved;

    await expect(status(inn, "Booked")).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

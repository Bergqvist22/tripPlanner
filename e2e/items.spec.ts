import { expect, test, type Page } from "@playwright/test";
import { field, unlockedTrip } from "./support";

function items(page: Page, heading: string) {
  return page.getByRole("region", { name: heading, exact: true });
}

test("a traveller collects Items on a Stop and on the Trip", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const tripId = await unlockedTrip(page, ["Monterey", "Los Angeles"]);
  await page.goto(`/trips/${tripId}`);
  const tripItems = items(page, "Items for the whole Trip");
  await expect(tripItems.getByText("No Items yet")).toBeVisible();

  // An Item for the whole Trip, priced per person with a decimal comma.
  await tripItems.getByRole("link", { name: "Add Item" }).click();
  await expect(field(page, "Belongs to")).toHaveValue("");
  await page.getByRole("button", { name: "Add Item" }).click();
  await expect(page.getByText("Choose a Category")).toBeVisible();
  await field(page, "Category").selectOption({ label: "Flight" });
  await field(page, "Title").fill("Stockholm to San Francisco");
  await field(page, "Cost", { exact: true }).fill("4500,50");
  await field(page, "The cost is").selectOption({ label: "Per person" });
  await page.getByRole("button", { name: "Add Item" }).click();
  await expect(page).toHaveURL(new RegExp(`/trips/${tripId}$`));
  const flights = tripItems.getByRole("region", { name: "Flight" });
  await expect(flights.getByRole("link", { name: "Stockholm to San Francisco" })).toBeVisible();
  await expect(flights).toContainText("4,500.50 per person");

  // An Accommodation on a Stop needs its check-in and check-out dates.
  await page.getByRole("link", { name: /Monterey/ }).click();
  await items(page, "Items").getByRole("link", { name: "Add Item" }).click();
  await expect(field(page, "Belongs to").locator("option:checked")).toHaveText("Monterey");
  // Nothing is left over from the Item added before.
  await expect(field(page, "Title")).toHaveValue("");
  await expect(field(page, "Check-in")).toHaveCount(0);
  await field(page, "Category").selectOption({ label: "Accommodation" });
  await field(page, "Title").fill("Monterey Bay Inn");
  await page.getByRole("button", { name: "Add Item" }).click();
  await expect(page.getByText("An Accommodation needs a check-in date")).toBeVisible();
  await field(page, "Check-in").fill("2027-07-02");
  await field(page, "Check-out").fill("2027-07-04");
  await field(page, "Link").fill("inn.example/rooms");
  await field(page, "Booking reference").fill("MBI-881");
  await page.getByRole("button", { name: "Add Item" }).click();
  await expect(page.getByRole("heading", { name: "Monterey", level: 1 })).toBeVisible();

  await items(page, "Items").getByRole("link", { name: "Add Item" }).click();
  await field(page, "Category").selectOption({ label: "Activity" });
  await field(page, "Title").fill("Aquarium");
  await page.getByRole("button", { name: "Add Item" }).click();

  // The Stop page groups its Items by Category, and leaves out the Trip's.
  const stopItems = items(page, "Items");
  await expect(stopItems.getByRole("heading", { level: 3 })).toHaveText(["Accommodation", "Activity"]);
  await expect(stopItems.getByText("Stockholm to San Francisco")).toHaveCount(0);
  const inn = stopItems.getByRole("region", { name: "Accommodation" });
  await expect(inn).toContainText("Check-in 2 Jul 2027 · Check-out 4 Jul 2027");

  // The link opens in a new tab, and the booking reference is copied with one tap.
  const link = inn.getByRole("link", { name: /inn\.example/ });
  await expect(link).toHaveAttribute("href", "https://inn.example/rooms");
  await expect(link).toHaveAttribute("target", "_blank");
  await inn.getByRole("button", { name: "Copy booking reference MBI-881" }).click();
  await expect(inn.getByText("Copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("MBI-881");

  // Opening an Item shows a page where any field is edited.
  await inn.getByRole("link", { name: "Monterey Bay Inn" }).click();
  await expect(page.getByRole("heading", { name: "Monterey Bay Inn", level: 1 })).toBeVisible();
  await field(page, "Title").fill("Monterey Bay Inn & Spa");
  // A label reaches its own field, not one on a page left open behind this one.
  await page.getByText("Notes", { exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole("textbox", { name: "Notes" })).toBeFocused();
  await page.keyboard.type("Ocean view.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Monterey Bay Inn & Spa", level: 1 })).toBeVisible();

  // Moving it to another Stop takes everything about it along.
  await field(page, "Belongs to").selectOption({ label: "Los Angeles" });
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("link", { name: "← Los Angeles" }).click();
  const moved = items(page, "Items").getByRole("region", { name: "Accommodation" });
  await expect(moved).toContainText("Monterey Bay Inn & Spa");
  await expect(moved).toContainText("MBI-881");
  await expect(moved).toContainText("Ocean view.");

  // Deleting an Item asks first.
  await moved.getByRole("link", { name: "Monterey Bay Inn & Spa" }).click();
  await page.getByRole("button", { name: "Delete Item" }).click();
  await expect(page.getByText("Delete Monterey Bay Inn & Spa?")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Delete Item" }).click();
  await page.getByRole("button", { name: "Yes, delete Item" }).click();
  await expect(page.getByRole("heading", { name: "Los Angeles", level: 1 })).toBeVisible();
  await expect(items(page, "Items").getByText("No Items yet")).toBeVisible();

  // Deleting a Stop says how many Items go with it.
  await page.goto(`/trips/${tripId}`);
  await page.getByRole("link", { name: /Monterey/ }).click();
  await page.getByRole("button", { name: "Delete Stop" }).click();
  await expect(page.getByText("Its 1 Item is deleted with it.")).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("Items fit the screen", async ({ page }) => {
    const tripId = await unlockedTrip(page, ["Monterey"]);
    const stops = await (await page.request.get(`/api/trips/${tripId}/stops`)).json();
    const added = await page.request.post(`/api/trips/${tripId}/items`, {
      data: {
        category: "accommodation",
        title: "Monterey Bay Inn & Spa with a remarkably long name for a hotel",
        stopId: stops.stops[0].id,
        date: "2027-07-02",
        endDate: "2027-07-04",
        cost: 123456.78,
        link: "https://a-very-long-booking-site-address.example/rooms/ocean-view/with/a/long/path?and=query",
        bookingReference: "MBI-2027-0000-1111-2222-3333-4444-5555-6666",
        notes: "Ocean view. ".repeat(20),
      },
    });
    const itemId = (await added.json()).item.id as string;
    const width = () => page.evaluate(() => document.documentElement.scrollWidth);

    await page.goto(`/trips/${tripId}/stops/${stops.stops[0].id}`);
    await expect(page.getByRole("link", { name: /Monterey Bay Inn/ })).toBeVisible();
    expect(await width()).toBeLessThanOrEqual(390);

    await page.goto(`/trips/${tripId}/items/${itemId}`);
    await expect(field(page, "Check-in")).toHaveValue("2027-07-02");
    expect(await width()).toBeLessThanOrEqual(390);
  });
});

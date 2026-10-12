import { expect, test, type Page } from "@playwright/test";
import { field, itemList, unlockedTrip } from "./support";

// The map's background is not what is tested, and its service is left alone.
test.beforeEach(({ page }) => page.route(/tile\.openstreetmap\.org/, (route) => route.abort()));

function dayByDay(page: Page, heading = "Day by day") {
  return page.getByRole("region", { name: heading, exact: true });
}

// What is listed under a day, or under Unscheduled, in the order it is listed.
function listed(page: Page, day: string, heading?: string) {
  return dayByDay(page, heading).getByRole("region", { name: day }).getByRole("listitem");
}

async function addItem(page: Page, category: string, title: string, when: { date?: string; time?: string } = {}) {
  await page.getByRole("link", { name: "Add Item" }).filter({ visible: true }).click();
  await field(page, "Category").selectOption({ label: category });
  await field(page, "Title").fill(title);
  if (when.date) await field(page, "Date", { exact: true }).fill(when.date);
  if (when.time) await field(page, "Time", { exact: true }).fill(when.time);
  await page.getByRole("button", { name: "Add Item" }).click();
  await expect(itemList(page).getByRole("link", { name: title })).toBeVisible();
}

test("a traveller gives Items a date and a time and sees each day of a Stop", async ({ page }) => {
  const tripId = await unlockedTrip(page, ["Monterey"]);
  await page.goto(`/trips/${tripId}`);
  await page.getByRole("link", { name: /Monterey/ }).click();
  await expect(page.getByRole("heading", { name: "Monterey", level: 1 })).toBeVisible();
  // Nothing to list day by day yet.
  await expect(dayByDay(page)).toHaveCount(0);

  // Any Item can be given a date and a time, and neither is needed.
  await addItem(page, "Food", "Dinner", { date: "2027-07-03", time: "19:00" });
  await addItem(page, "Activity", "Kayaking");
  await addItem(page, "Activity", "Whale watching", { date: "2027-07-03", time: "09:30" });
  await addItem(page, "Other", "Buy sunscreen", { date: "2027-07-03" });
  await addItem(page, "Activity", "Aquarium", { date: "2027-07-02", time: "10:00" });

  // An Accommodation is on its check-in day.
  await page.getByRole("link", { name: "Add Item" }).click();
  await field(page, "Category").selectOption({ label: "Accommodation" });
  await field(page, "Title").fill("Monterey Bay Inn");
  await field(page, "Check-in").fill("2027-07-02");
  await field(page, "Check-out").fill("2027-07-04");
  await field(page, "Time", { exact: true }).fill("15:00");
  await page.getByRole("button", { name: "Add Item" }).click();

  // Each day in order, and within it by time, with what has no time first.
  await expect(dayByDay(page).getByRole("heading", { level: 3 })).toHaveText([
    "Fri, 2 Jul 2027",
    "Sat, 3 Jul 2027",
    "Unscheduled",
  ]);
  await expect(listed(page, "Fri, 2 Jul 2027")).toHaveText([
    /10:00.*Aquarium.*Activity · Suggestion/,
    /15:00.*Monterey Bay Inn.*Check-in · Accommodation · Suggestion/,
  ]);
  await expect(listed(page, "Sat, 3 Jul 2027")).toHaveText([/^Buy sunscreen/, /09:30.*Whale watching/, /19:00.*Dinner/]);
  await expect(listed(page, "Unscheduled")).toHaveText([/Kayaking/]);
  // The list by Category says when each Item is too.
  await expect(page.getByRole("region", { name: "Food" })).toContainText("3 Jul 2027 at 19:00");

  // Giving an Unscheduled Item a date lists it under that day, without a save button.
  await listed(page, "Unscheduled").getByRole("link", { name: "Kayaking" }).click();
  await expect(page.getByRole("heading", { name: "Kayaking", level: 1 })).toBeVisible();
  await field(page, "Date", { exact: true }).fill("2027-07-03");
  await field(page, "Time", { exact: true }).fill("14:00");
  await expect(page.getByText("Saved.", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole("link", { name: "← Monterey" }).click();
  await expect(listed(page, "Sat, 3 Jul 2027")).toHaveText([/Buy sunscreen/, /Whale watching/, /14:00.*Kayaking/, /Dinner/]);
  await expect(dayByDay(page).getByRole("region", { name: "Unscheduled" })).toHaveCount(0);

  // Taking the date away again makes it Unscheduled.
  await listed(page, "Sat, 3 Jul 2027").getByRole("link", { name: "Kayaking" }).click();
  await field(page, "Date", { exact: true }).fill("");
  await field(page, "Time", { exact: true }).fill("");
  await expect(page.getByText("Saved.", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole("link", { name: "← Monterey" }).click();
  await expect(listed(page, "Unscheduled")).toHaveText([/Kayaking/]);

  // A Rejected Item leaves the day, and is back while Rejected Items are shown.
  const dinner = page.getByRole("region", { name: "Food" }).getByRole("listitem").filter({ hasText: "Dinner" });
  await dinner.getByRole("button", { name: "Rejected", exact: true }).click();
  await expect(listed(page, "Sat, 3 Jul 2027")).toHaveText([/Buy sunscreen/, /Whale watching/]);
  await page.getByRole("button", { name: "Show 1 Rejected" }).click();
  await expect(listed(page, "Sat, 3 Jul 2027")).toHaveText([/Buy sunscreen/, /Whale watching/, /Dinner.*Food · Rejected/]);
});

test("Items for the whole Trip are listed by day on the Trip page", async ({ page }) => {
  const tripId = await unlockedTrip(page, ["Monterey"]);
  const stopId = (await (await page.request.get(`/api/trips/${tripId}/stops`)).json()).stops[0].id as string;
  const add = (data: Record<string, unknown>) => page.request.post(`/api/trips/${tripId}/items`, { data });
  await add({ category: "flight", title: "Flight home", date: "2027-07-12", time: "17:40" });
  await add({ category: "car_rental", title: "Pick up the car", date: "2027-07-01", time: "14:00" });
  await add({ category: "other", title: "Travel insurance" });
  await add({ category: "flight", title: "Flight out", date: "2027-07-01", time: "06:15" });
  // What belongs to a Stop is listed on that Stop's page.
  await add({ stopId, category: "activity", title: "Aquarium", date: "2027-07-01", time: "10:00" });

  await page.goto(`/trips/${tripId}`);

  const heading = "Day by day for the whole Trip";
  await expect(dayByDay(page, heading).getByRole("heading", { level: 3 })).toHaveText([
    "Thu, 1 Jul 2027",
    "Mon, 12 Jul 2027",
    "Unscheduled",
  ]);
  await expect(listed(page, "Thu, 1 Jul 2027", heading)).toHaveText([/06:15.*Flight out/, /14:00.*Pick up the car/]);
  await expect(listed(page, "Mon, 12 Jul 2027", heading)).toHaveText([/17:40.*Flight home/]);
  await expect(listed(page, "Unscheduled", heading)).toHaveText([/Travel insurance/]);
});

test("an Item that is no longer an Accommodation can be given any date", async ({ page }) => {
  const tripId = await unlockedTrip(page, ["Monterey"]);
  const stopId = (await (await page.request.get(`/api/trips/${tripId}/stops`)).json()).stops[0].id as string;
  const added = await page.request.post(`/api/trips/${tripId}/items`, {
    data: { stopId, category: "accommodation", title: "Beach picnic", date: "2027-07-02", endDate: "2027-07-04" },
  });
  const itemId = (await added.json()).item.id as string;
  const savedText = page.getByText("Saved.", { exact: true }).filter({ visible: true });

  // Its check-out date goes with the Category, rather than being held against a later date unseen.
  await page.goto(`/trips/${tripId}/items/${itemId}`);
  await field(page, "Category").selectOption({ label: "Activity" });
  await expect(savedText).toBeVisible();
  await field(page, "Date", { exact: true }).fill("2027-07-05");
  await field(page, "Notes").click();
  await expect(savedText).toBeVisible();

  const { item } = await (await page.request.get(`/api/trips/${tripId}/items/${itemId}`)).json();
  expect(item).toMatchObject({ category: "activity", date: "2027-07-05", endDate: null });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the days fit the screen", async ({ page }) => {
    const tripId = await unlockedTrip(page, ["Monterey"]);
    const stopId = (await (await page.request.get(`/api/trips/${tripId}/stops`)).json()).stops[0].id as string;
    await page.request.post(`/api/trips/${tripId}/items`, {
      data: {
        stopId,
        category: "accommodation",
        title: "Monterey Bay Inn & Spa with a remarkably long name for a hotel, longer than any screen",
        date: "2027-07-02",
        endDate: "2027-07-04",
        time: "15:00",
      },
    });

    await page.goto(`/trips/${tripId}/stops/${stopId}`);

    await expect(listed(page, "Fri, 2 Jul 2027")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

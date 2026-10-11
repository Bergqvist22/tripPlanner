import { expect, test, type Page } from "@playwright/test";
import { field, unlockedTrip } from "./support";

function route(page: Page) {
  return page.getByRole("region", { name: "Route" }).getByRole("listitem");
}

// The new order is shown at once; this is when the server has it too.
function orderSaved(page: Page) {
  return page.waitForResponse((response) => response.url().endsWith("/stops/order") && response.ok());
}

// Where to press on a Stop's handle, and where to let go to land on another Stop's place.
async function middleOf(page: Page, handleOf: string) {
  const box = (await page.getByRole("button", { name: `Move ${handleOf}` }).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("a traveller lays out the Route of a Trip", async ({ page }) => {
  const tripId = await unlockedTrip(page);
  await page.goto(`/trips/${tripId}`);
  await expect(page.getByText("No Stops yet")).toBeVisible();

  // A name is all a Stop needs.
  for (const name of ["San Francisco", "Monterey", "Los Angeles"]) {
    await field(page, "New Stop").fill(name);
    await page.getByRole("button", { name: "Add Stop" }).click();
    await expect(route(page).filter({ hasText: name })).toBeVisible();
  }
  await expect(route(page)).toHaveText([/San Francisco/, /Monterey/, /Los Angeles/]);
  await expect(route(page).nth(1)).toContainText("No dates yet");

  // Opening a Stop shows a page for it, where its dates and notes are edited.
  await page.getByRole("link", { name: /Monterey/ }).click();
  await expect(page.getByRole("heading", { name: "Monterey", level: 1 })).toBeVisible();
  await field(page, "Stop name").fill("Monterey Bay");
  await field(page, "Arrival").fill("2027-07-02");
  await field(page, "Departure").fill("2027-07-01");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Departure cannot be before arrival")).toBeVisible();

  await field(page, "Departure").fill("2027-07-04");
  await field(page, "Notes").fill("Aquarium opens at 10.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Monterey Bay", level: 1 })).toBeVisible();
  await expect(page.getByText("2 Jul 2027 – 4 Jul 2027 · 2 nights")).toBeVisible();
  await page.reload();
  await expect(field(page, "Notes")).toHaveValue("Aquarium opens at 10.");

  // The Trip page shows the Stops in order with dates and nights.
  await page.getByRole("link", { name: /California road trip/ }).click();
  await expect(route(page).nth(1)).toContainText("Monterey Bay");
  await expect(route(page).nth(1)).toContainText("2 Jul 2027 – 4 Jul 2027");
  await expect(route(page).nth(1)).toContainText("2 nights");

  // Dragging with the mouse reorders them, and the new order is kept.
  const from = await middleOf(page, "Los Angeles");
  const to = await middleOf(page, "San Francisco");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, to.y - 5, { steps: 8 });
  const dropped = orderSaved(page);
  await page.mouse.up();
  await expect(route(page)).toHaveText([/Los Angeles/, /San Francisco/, /Monterey Bay/]);
  await dropped;
  await page.reload();
  await expect(route(page)).toHaveText([/Los Angeles/, /San Francisco/, /Monterey Bay/]);

  // So does moving a Stop with the arrow keys.
  const moved = orderSaved(page);
  await page.getByRole("button", { name: "Move Monterey Bay" }).press("ArrowUp");
  await expect(route(page)).toHaveText([/Los Angeles/, /Monterey Bay/, /San Francisco/]);
  await moved;
  await expect(page.getByRole("button", { name: "Move Monterey Bay" })).toBeFocused();

  // Deleting a Stop asks first.
  await page.getByRole("link", { name: /San Francisco/ }).click();
  await page.getByRole("button", { name: "Delete Stop" }).click();
  await expect(page.getByText("Delete San Francisco from the Route?")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Delete Stop" }).click();
  await page.getByRole("button", { name: "Yes, delete Stop" }).click();
  await expect(page).toHaveURL(new RegExp(`/trips/${tripId}$`));
  await expect(route(page)).toHaveText([/Los Angeles/, /Monterey Bay/]);
});

test("a Stop of a locked Trip leads to the Trip password", async ({ page, browser }) => {
  const tripId = await unlockedTrip(page, ["San Francisco"]);
  await page.goto(`/trips/${tripId}`);
  await page.getByRole("link", { name: /San Francisco/ }).click();
  await expect(page.getByRole("heading", { name: "San Francisco" })).toBeVisible();

  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(page.url());
  await expect(stranger.getByRole("heading", { name: "This Trip is locked" })).toBeVisible();
  await expect(stranger.getByText("San Francisco")).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a traveller reorders Stops by touch", async ({ page }) => {
    const tripId = await unlockedTrip(page, ["San Francisco", "Monterey", "Los Angeles"]);
    await page.goto(`/trips/${tripId}`);
    await expect(route(page)).toHaveText([/San Francisco/, /Monterey/, /Los Angeles/]);

    // A finger presses San Francisco's handle and drags it below Los Angeles.
    const from = await middleOf(page, "San Francisco");
    const to = await middleOf(page, "Los Angeles");
    const finger = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", y?: number) =>
      finger.send("Input.dispatchTouchEvent", { type, touchPoints: y === undefined ? [] : [{ x: from.x, y }] });
    await touch("touchStart", from.y);
    for (let step = 1; step <= 8; step++) {
      await touch("touchMove", from.y + ((to.y + 5 - from.y) * step) / 8);
    }
    const dropped = orderSaved(page);
    await touch("touchEnd");

    await expect(route(page)).toHaveText([/Monterey/, /Los Angeles/, /San Francisco/]);
    await dropped;
    // The page was not scrolled by the drag, and the order is kept.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.reload();
    await expect(route(page)).toHaveText([/Monterey/, /Los Angeles/, /San Francisco/]);

    // Nothing is wider than the screen.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

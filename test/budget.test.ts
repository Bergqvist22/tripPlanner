import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { browser, emptyDatabase, exchangeRateService, unlockedTrip } from "./support";

// One euro buys 10 kronor or 1.25 dollars, so a dollar is 8 kronor.
let service: ReturnType<typeof exchangeRateService>;

beforeEach(emptyDatabase);
beforeEach(() => {
  service = exchangeRateService({ EUR: 1, SEK: 10, USD: 1.25 });
  // Only the clock is faked, so a day passes in no real time.
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

const HOUR = 60 * 60 * 1000;

type Traveller = ReturnType<typeof browser>;
type Amount = { total: number; perPerson: number };

async function budgetAsRead(traveller: Traveller, tripId: string) {
  const response = await traveller.readBudget(tripId);
  expect(response.status).toBe(200);
  return (await response.json()).budget;
}

async function addedStop(traveller: Traveller, tripId: string, name: string) {
  return (await (await traveller.addStop(tripId, { name })).json()).stop as { id: string };
}

// Adds an Item and gives it the Status, as a new Item is always a Suggestion.
async function addedItem(traveller: Traveller, tripId: string, status: string, item: Record<string, unknown>) {
  const dates = item.category === "accommodation" ? { date: "2027-07-02", endDate: "2027-07-04" } : {};
  const response = await traveller.addItem(tripId, { category: "activity", title: "Item", ...dates, ...item });
  const added = (await response.json()).item as { id: string };
  if (status !== "suggestion") await traveller.updateItem(tripId, added.id, { status });
  return added;
}

const NOTHING: Amount = { total: 0, perPerson: 0 };

describe("the Budget of a Trip", () => {
  test("is nothing for a Trip without Items", async () => {
    const { tripId, emil } = await unlockedTrip();

    const budget = await budgetAsRead(emil, tripId);

    expect(budget).toMatchObject({ ...NOTHING, displayCurrency: "SEK", travellerCount: 4, suggestions: NOTHING });
    expect(budget.byStatus).toEqual({ booked: NOTHING, selected: NOTHING });
    expect(budget.byStop).toEqual([{ stopId: null, name: null, ...NOTHING }]);
  });

  test("counts a total Item once and splits it between the travellers", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 4 });
    await addedItem(emil, tripId, "booked", { cost: 3200, costBasis: "total" });

    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 3200, perPerson: 800 });
  });

  test("multiplies a per-person Item by the traveller count", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 4 });
    await addedItem(emil, tripId, "booked", { cost: 4500.5, costBasis: "per_person" });

    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 18002, perPerson: 4500.5 });
  });

  test("adds total and per-person Items into one group total and one per-person figure", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 4 });
    await addedItem(emil, tripId, "booked", { cost: 4500.5, costBasis: "per_person" });
    await addedItem(emil, tripId, "selected", { cost: 3200, costBasis: "total" });
    await addedItem(emil, tripId, "selected", { cost: 0.1 });
    await addedItem(emil, tripId, "selected", { cost: 0.2 });

    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 21202.3, perPerson: 5300.58 });
  });

  test("rounds the per-person figure to whole cents", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 3 });
    await addedItem(emil, tripId, "selected", { cost: 100 });

    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 100, perPerson: 33.33 });
  });

  test("sums only Items that are Selected or Booked", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 2 });
    await addedItem(emil, tripId, "selected", { cost: 100 });
    await addedItem(emil, tripId, "booked", { cost: 20 });
    await addedItem(emil, tripId, "suggestion", { cost: 3000 });
    await addedItem(emil, tripId, "rejected", { cost: 40000 });

    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 120, perPerson: 60 });
  });

  test("shows how much is Booked and how much is only Selected", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 2 });
    await addedItem(emil, tripId, "selected", { cost: 100 });
    await addedItem(emil, tripId, "selected", { cost: 50, costBasis: "per_person" });
    await addedItem(emil, tripId, "booked", { cost: 20 });
    await addedItem(emil, tripId, "suggestion", { cost: 3000 });

    expect((await budgetAsRead(emil, tripId)).byStatus).toEqual({
      booked: { total: 20, perPerson: 10 },
      selected: { total: 200, perPerson: 100 },
    });
  });

  test("shows the cost of Suggestions separately and ignores Rejected Items", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 2 });
    await addedItem(emil, tripId, "booked", { cost: 20 });
    await addedItem(emil, tripId, "suggestion", { cost: 3000 });
    await addedItem(emil, tripId, "suggestion", { cost: 250, costBasis: "per_person" });
    await addedItem(emil, tripId, "rejected", { cost: 40000 });

    const budget = await budgetAsRead(emil, tripId);

    expect(budget.suggestions).toEqual({ total: 3500, perPerson: 1750 });
    expect(budget).toMatchObject({ total: 20, perPerson: 10 });
  });

  test("is not affected by Items without a cost", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 2 });
    await addedItem(emil, tripId, "booked", { cost: 20 });
    await addedItem(emil, tripId, "booked", {});
    await addedItem(emil, tripId, "selected", { cost: null, costBasis: "per_person" });
    await addedItem(emil, tripId, "suggestion", {});

    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 20, perPerson: 10, suggestions: NOTHING });
  });

  test("is broken down by Category, in the order Categories are listed", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 2 });
    await addedItem(emil, tripId, "booked", { category: "flight", cost: 4000, costBasis: "per_person" });
    await addedItem(emil, tripId, "selected", { category: "accommodation", cost: 3000 });
    await addedItem(emil, tripId, "booked", { category: "accommodation", cost: 1000 });
    await addedItem(emil, tripId, "suggestion", { category: "food", cost: 700 });
    await addedItem(emil, tripId, "rejected", { category: "activity", cost: 900 });

    expect((await budgetAsRead(emil, tripId)).byCategory).toEqual([
      { category: "flight", total: 8000, perPerson: 4000 },
      { category: "car_rental", ...NOTHING },
      { category: "accommodation", total: 4000, perPerson: 2000 },
      { category: "activity", ...NOTHING },
      { category: "food", ...NOTHING },
      { category: "transport", ...NOTHING },
      { category: "other", ...NOTHING },
    ]);
  });

  test("is broken down by Stop in Route order, plus the Trip as a whole", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 2 });
    const monterey = await addedStop(emil, tripId, "Monterey");
    const losAngeles = await addedStop(emil, tripId, "Los Angeles");
    const bigSur = await addedStop(emil, tripId, "Big Sur");
    await emil.reorderStops(tripId, [monterey.id, bigSur.id, losAngeles.id]);
    await addedItem(emil, tripId, "booked", { stopId: monterey.id, cost: 3000 });
    await addedItem(emil, tripId, "selected", { stopId: monterey.id, cost: 200, costBasis: "per_person" });
    await addedItem(emil, tripId, "suggestion", { stopId: monterey.id, cost: 9000 });
    await addedItem(emil, tripId, "selected", { stopId: losAngeles.id, cost: 500 });
    await addedItem(emil, tripId, "booked", { category: "flight", cost: 4000, costBasis: "per_person" });

    const budget = await budgetAsRead(emil, tripId);

    expect(budget.byStop).toEqual([
      { stopId: monterey.id, name: "Monterey", total: 3400, perPerson: 1700 },
      { stopId: bigSur.id, name: "Big Sur", ...NOTHING },
      { stopId: losAngeles.id, name: "Los Angeles", total: 500, perPerson: 250 },
      { stopId: null, name: null, total: 8000, perPerson: 4000 },
    ]);
    expect(budget).toMatchObject({ total: 11900, perPerson: 5950 });
  });

  test("adds up to the same total in every breakdown", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 3 });
    const monterey = await addedStop(emil, tripId, "Monterey");
    await addedItem(emil, tripId, "booked", { stopId: monterey.id, category: "accommodation", cost: 1234.56 });
    await addedItem(emil, tripId, "selected", { stopId: monterey.id, category: "food", cost: 19.99, costBasis: "per_person" });
    await addedItem(emil, tripId, "selected", { category: "car_rental", cost: 777.77 });

    const budget = await budgetAsRead(emil, tripId);
    const sum = (amounts: Amount[]) => Math.round(amounts.reduce((cents, { total }) => cents + total * 100, 0)) / 100;

    expect(budget.total).toBe(2072.3);
    expect(sum(budget.byCategory)).toBe(budget.total);
    expect(sum(budget.byStop)).toBe(budget.total);
    expect(sum([budget.byStatus.booked, budget.byStatus.selected])).toBe(budget.total);
  });

  test("leaves out deleted Items and the Items of a deleted Stop", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 2 });
    const monterey = await addedStop(emil, tripId, "Monterey");
    await addedItem(emil, tripId, "booked", { cost: 20 });
    const deleted = await addedItem(emil, tripId, "booked", { cost: 500 });
    await addedItem(emil, tripId, "selected", { stopId: monterey.id, cost: 3000 });
    await addedItem(emil, tripId, "suggestion", { stopId: monterey.id, cost: 70 });

    await emil.deleteItem(tripId, deleted.id);
    await emil.deleteStop(tripId, monterey.id);

    const budget = await budgetAsRead(emil, tripId);
    expect(budget).toMatchObject({ total: 20, perPerson: 10, suggestions: NOTHING });
    expect(budget.byStop).toEqual([{ stopId: null, name: null, total: 20, perPerson: 10 }]);
  });
});

describe("the Budget follows the Trip", () => {
  test("when an Item is added, changed or moved", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 2 });
    const monterey = await addedStop(emil, tripId, "Monterey");
    const inn = await addedItem(emil, tripId, "selected", { cost: 100 });
    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 100 });

    await emil.updateItem(tripId, inn.id, { cost: 150, costBasis: "per_person" });
    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 300, perPerson: 150 });

    await emil.updateItem(tripId, inn.id, { stopId: monterey.id, category: "food" });
    const budget = await budgetAsRead(emil, tripId);
    expect(budget.byStop).toEqual([
      { stopId: monterey.id, name: "Monterey", total: 300, perPerson: 150 },
      { stopId: null, name: null, ...NOTHING },
    ]);
    expect(budget.byCategory.find(({ category }: { category: string }) => category === "food").total).toBe(300);
  });

  test("when the Status of an Item changes", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 2 });
    const inn = await addedItem(emil, tripId, "suggestion", { cost: 100 });
    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 0, suggestions: { total: 100, perPerson: 50 } });

    await emil.updateItem(tripId, inn.id, { status: "selected" });
    expect(await budgetAsRead(emil, tripId)).toMatchObject({
      total: 100,
      suggestions: NOTHING,
      byStatus: { booked: NOTHING, selected: { total: 100, perPerson: 50 } },
    });

    await emil.updateItem(tripId, inn.id, { status: "booked" });
    expect((await budgetAsRead(emil, tripId)).byStatus).toEqual({
      booked: { total: 100, perPerson: 50 },
      selected: NOTHING,
    });

    await emil.updateItem(tripId, inn.id, { status: "rejected" });
    expect(await budgetAsRead(emil, tripId)).toMatchObject({ ...NOTHING, suggestions: NOTHING });
  });

  test("when the traveller count changes", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 4 });
    await addedItem(emil, tripId, "booked", { cost: 1000, costBasis: "per_person" });
    await addedItem(emil, tripId, "booked", { cost: 600 });
    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 4600, perPerson: 1150, travellerCount: 4 });

    await emil.updateTrip(tripId, { travellerCount: 2 });

    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 2600, perPerson: 1300, travellerCount: 2 });
  });

  test("when the display currency changes", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 2, displayCurrency: "SEK" });
    await addedItem(emil, tripId, "booked", { cost: 800, currency: "SEK" });
    await addedItem(emil, tripId, "selected", { cost: 100, currency: "USD" });
    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 1600, perPerson: 800, displayCurrency: "SEK" });

    await emil.updateTrip(tripId, { displayCurrency: "USD" });
    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 200, perPerson: 100, displayCurrency: "USD" });

    await emil.updateTrip(tripId, { displayCurrency: "EUR" });
    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 160, perPerson: 80, displayCurrency: "EUR" });
  });
});

describe("the Budget across currencies", () => {
  test("converts an Item from its own currency to the display currency", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 2, displayCurrency: "SEK" });
    await addedItem(emil, tripId, "booked", { cost: 100, currency: "USD" });
    await addedItem(emil, tripId, "booked", { cost: 50, currency: "SEK" });

    expect(await budgetAsRead(emil, tripId)).toMatchObject({
      total: 850,
      perPerson: 425,
      displayCurrency: "SEK",
      ratesOutOfDate: false,
      withoutRate: [],
    });
  });

  test("leaves the Item priced as it was", async () => {
    const { tripId, emil } = await unlockedTrip({ displayCurrency: "SEK" });
    const tour = await addedItem(emil, tripId, "booked", { cost: 100, currency: "USD" });

    await budgetAsRead(emil, tripId);

    const { item } = await (await emil.readItem(tripId, tour.id)).json();
    expect(item).toMatchObject({ cost: 100, currency: "USD" });
  });

  test("converts a per-person Item before multiplying it by the traveller count", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 4, displayCurrency: "SEK" });
    await addedItem(emil, tripId, "booked", { cost: 100.1, currency: "USD", costBasis: "per_person" });

    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 3203.2, perPerson: 800.8 });
  });

  test("rounds each converted cost to whole cents", async () => {
    service.rates = { EUR: 1, SEK: 1, USD: 3 };
    const { tripId, emil } = await unlockedTrip({ travellerCount: 3, displayCurrency: "SEK" });
    // A third of a krona each: 0.33, three times over.
    await addedItem(emil, tripId, "booked", { cost: 1, currency: "USD", costBasis: "per_person" });

    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 0.99, perPerson: 0.33 });
  });

  test("converts every breakdown and the Suggestions", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 2, displayCurrency: "SEK" });
    const monterey = await addedStop(emil, tripId, "Monterey");
    await addedItem(emil, tripId, "booked", { stopId: monterey.id, category: "food", cost: 10, currency: "USD" });
    await addedItem(emil, tripId, "selected", { category: "flight", cost: 30, currency: "EUR" });
    await addedItem(emil, tripId, "suggestion", { cost: 5, currency: "USD", costBasis: "per_person" });

    const budget = await budgetAsRead(emil, tripId);

    expect(budget).toMatchObject({ total: 380, perPerson: 190 });
    expect(budget.byStatus).toEqual({
      booked: { total: 80, perPerson: 40 },
      selected: { total: 300, perPerson: 150 },
    });
    expect(budget.byStop).toEqual([
      { stopId: monterey.id, name: "Monterey", total: 80, perPerson: 40 },
      { stopId: null, name: null, total: 300, perPerson: 150 },
    ]);
    expect(budget.byCategory.filter(({ total }: Amount) => total > 0)).toEqual([
      { category: "flight", total: 300, perPerson: 150 },
      { category: "food", total: 80, perPerson: 40 },
    ]);
    expect(budget.suggestions).toEqual({ total: 80, perPerson: 40 });
  });
});

describe("exchange rates are fetched once a day", () => {
  test("the rate fetched is used for the rest of the day, then a new one is fetched", async () => {
    const { tripId, emil } = await unlockedTrip({ displayCurrency: "SEK" });
    await addedItem(emil, tripId, "booked", { cost: 100, currency: "USD" });
    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 800 });

    service.rates = { EUR: 1, SEK: 11, USD: 1.25 };
    vi.advanceTimersByTime(23 * HOUR);
    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 800, ratesOutOfDate: false });

    vi.advanceTimersByTime(2 * HOUR);
    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 880, ratesOutOfDate: false });
  });

  test("a rate fetched for one Trip is used for another", async () => {
    const first = await unlockedTrip({ displayCurrency: "SEK" });
    await addedItem(first.emil, first.tripId, "booked", { cost: 100, currency: "USD" });
    await budgetAsRead(first.emil, first.tripId);

    service.down = true;
    const second = await unlockedTrip({ displayCurrency: "USD" });
    await addedItem(second.emil, second.tripId, "booked", { cost: 40, currency: "EUR" });

    expect(await budgetAsRead(second.emil, second.tripId)).toMatchObject({ total: 50, ratesOutOfDate: false });
  });

  test("a Trip priced in its display currency alone needs no rates", async () => {
    service.down = true;
    const { tripId, emil } = await unlockedTrip({ displayCurrency: "SEK" });
    await addedItem(emil, tripId, "booked", { cost: 600, currency: "SEK" });
    await addedItem(emil, tripId, "booked", { currency: "USD" });

    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 600, ratesOutOfDate: false, withoutRate: [] });
  });
});

describe("when no fresh exchange rate can be fetched", () => {
  test("the last known rate is used and the Budget is marked as possibly out of date", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 2, displayCurrency: "SEK" });
    await addedItem(emil, tripId, "booked", { cost: 100, currency: "USD" });
    await budgetAsRead(emil, tripId);

    service.down = true;
    vi.advanceTimersByTime(3 * 24 * HOUR);

    expect(await budgetAsRead(emil, tripId)).toMatchObject({
      total: 800,
      perPerson: 400,
      ratesOutOfDate: true,
      withoutRate: [],
    });
  });

  test("the Budget is up to date again once rates can be fetched", async () => {
    const { tripId, emil } = await unlockedTrip({ displayCurrency: "SEK" });
    await addedItem(emil, tripId, "booked", { cost: 100, currency: "USD" });
    await budgetAsRead(emil, tripId);
    service.down = true;
    vi.advanceTimersByTime(3 * 24 * HOUR);
    await budgetAsRead(emil, tripId);

    service.down = false;
    service.rates = { EUR: 1, SEK: 11, USD: 1.25 };
    // A service that failed is not asked again for a few minutes.
    vi.advanceTimersByTime(HOUR);

    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 880, ratesOutOfDate: false });
  });

  test("and none was ever fetched, the Items that cannot be converted are left out", async () => {
    service.down = true;
    const { tripId, emil } = await unlockedTrip({ travellerCount: 2, displayCurrency: "SEK" });
    await addedItem(emil, tripId, "booked", { cost: 100, currency: "USD" });
    await addedItem(emil, tripId, "suggestion", { cost: 70, currency: "EUR" });
    await addedItem(emil, tripId, "booked", { cost: 50, currency: "SEK" });

    expect(await budgetAsRead(emil, tripId)).toMatchObject({
      total: 50,
      perPerson: 25,
      suggestions: NOTHING,
      ratesOutOfDate: true,
      withoutRate: ["EUR", "SEK", "USD"],
    });
  });

  test("for a currency the service does not know, its Items are left out and the rest is up to date", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 2, displayCurrency: "SEK" });
    await addedItem(emil, tripId, "booked", { cost: 100, currency: "USD" });
    await addedItem(emil, tripId, "booked", { cost: 9000, currency: "ISK" });
    await addedItem(emil, tripId, "rejected", { cost: 9000, currency: "JPY" });

    expect(await budgetAsRead(emil, tripId)).toMatchObject({
      total: 800,
      ratesOutOfDate: false,
      withoutRate: ["ISK"],
    });
  });

  test("for a display currency the service does not know, nothing can be converted to it", async () => {
    const { tripId, emil } = await unlockedTrip({ displayCurrency: "ISK" });
    await addedItem(emil, tripId, "booked", { cost: 100, currency: "USD" });
    await addedItem(emil, tripId, "booked", { cost: 9000, currency: "ISK" });

    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 9000, withoutRate: ["ISK"] });
  });

  test("a rate the service has since dropped is still used, and marked", async () => {
    service.rates = { EUR: 1, SEK: 10, USD: 1.25, ISK: 125 };
    const { tripId, emil } = await unlockedTrip({ displayCurrency: "SEK" });
    await addedItem(emil, tripId, "booked", { cost: 1000, currency: "ISK" });
    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 80, ratesOutOfDate: false });

    service.rates = { EUR: 1, SEK: 10, USD: 1.25 };
    vi.advanceTimersByTime(25 * HOUR);

    expect(await budgetAsRead(emil, tripId)).toMatchObject({ total: 80, ratesOutOfDate: true, withoutRate: [] });
  });
});

describe("the Budget is behind the Trip password", () => {
  test("a browser that has not unlocked the Trip cannot read it", async () => {
    const { tripId, emil } = await unlockedTrip();
    await addedItem(emil, tripId, "booked", { cost: 600 });

    const response = await browser().readBudget(tripId);

    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty("budget");
  });

  test("a Trip that does not exist has none", async () => {
    const response = await browser().readBudget("7f0c3a52-58d1-4b1e-9d0f-0f5a4a1f6c11");

    expect(response.status).toBe(404);
  });
});

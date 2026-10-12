import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "@/db/client";
import { browser, emptyDatabase, exchangeRateService, runPurge, unlockedTrip } from "./support";

beforeEach(emptyDatabase);
beforeEach(() => {
  exchangeRateService({ EUR: 1, SEK: 10 });
  // Only the clock is faked, so 30 days pass in no real time.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2027-06-01T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const CRON_SECRET = "test-cron-secret";

type Traveller = ReturnType<typeof browser>;
type Added = { id: string } & Record<string, unknown>;

async function addedStop(traveller: Traveller, tripId: string, name: string) {
  return (await (await traveller.addStop(tripId, { name })).json()).stop as Added;
}

async function addedItem(traveller: Traveller, tripId: string, item: Record<string, unknown>) {
  const response = await traveller.addItem(tripId, { category: "activity", ...item });
  return (await response.json()).item as Added;
}

async function stopNames(traveller: Traveller, tripId: string) {
  const { stops } = (await (await traveller.listStops(tripId)).json()) as { stops: { name: string }[] };
  return stops.map(({ name }) => name);
}

async function itemsAsListed(traveller: Traveller, tripId: string) {
  return (await (await traveller.listItems(tripId)).json()).items as Added[];
}

async function recentlyDeleted(traveller: Traveller, tripId: string) {
  const response = await traveller.readDeleted(tripId);
  expect(response.status).toBe(200);
  return (await response.json()) as { stops: Record<string, unknown>[]; items: Record<string, unknown>[] };
}

// How many Stops and Items are stored at all, deleted or not.
async function stored() {
  const { rows } = await db().execute(
    sql`SELECT (SELECT count(*)::int FROM stops) AS stops, (SELECT count(*)::int FROM items) AS items`,
  );
  return rows[0];
}

// A Trip with three Stops.
async function tripWithStops() {
  const { tripId, emil } = await unlockedTrip();
  const sanFrancisco = await addedStop(emil, tripId, "San Francisco");
  const monterey = await addedStop(emil, tripId, "Monterey");
  const losAngeles = await addedStop(emil, tripId, "Los Angeles");
  return { tripId, emil, sanFrancisco, monterey, losAngeles };
}

describe("Recently deleted", () => {
  test("is empty until something is deleted", async () => {
    const { tripId, emil } = await tripWithStops();

    expect(await recentlyDeleted(emil, tripId)).toEqual({ stops: [], items: [] });
  });

  test("lists deleted Stops and Items, the latest first, with when they were deleted", async () => {
    const { tripId, emil, monterey, losAngeles } = await tripWithStops();
    const flight = await addedItem(emil, tripId, { category: "flight", title: "Flight out" });
    const pier = await addedItem(emil, tripId, { title: "Pier", stopId: losAngeles.id });

    await emil.deleteItem(tripId, flight.id);
    vi.advanceTimersByTime(36 * HOUR);
    await emil.deleteStop(tripId, monterey.id);
    await emil.deleteItem(tripId, pier.id);

    expect(await recentlyDeleted(emil, tripId)).toEqual({
      stops: [{ id: monterey.id, name: "Monterey", deletedAt: "2027-06-03T00:00:00.000Z", daysLeft: 30, itemCount: 0 }],
      items: [
        {
          id: pier.id,
          title: "Pier",
          category: "activity",
          deletedAt: "2027-06-03T00:00:00.000Z",
          daysLeft: 30,
          stop: { id: losAngeles.id, name: "Los Angeles", onRoute: true },
        },
        {
          id: flight.id,
          title: "Flight out",
          category: "flight",
          deletedAt: "2027-06-01T12:00:00.000Z",
          daysLeft: 29,
          stop: null,
        },
      ],
    });
  });

  test("counts the Items deleted with a Stop under the Stop, and lists one deleted before it on its own", async () => {
    const { tripId, emil, monterey } = await tripWithStops();
    const whales = await addedItem(emil, tripId, { title: "Whale watching", stopId: monterey.id });
    await addedItem(emil, tripId, { title: "Aquarium", stopId: monterey.id });
    await addedItem(emil, tripId, { title: "Cannery Row", stopId: monterey.id });

    await emil.deleteItem(tripId, whales.id);
    vi.advanceTimersByTime(HOUR);
    await emil.deleteStop(tripId, monterey.id);

    const { stops, items } = await recentlyDeleted(emil, tripId);
    expect(stops).toMatchObject([{ name: "Monterey", itemCount: 2 }]);
    expect(items).toMatchObject([
      { title: "Whale watching", stop: { id: monterey.id, name: "Monterey", onRoute: false } },
    ]);
  });

  test("is of one Trip, and not read without its Trip password", async () => {
    const { tripId, emil, monterey } = await tripWithStops();
    await emil.deleteStop(tripId, monterey.id);
    const other = await unlockedTrip({ name: "Another Trip" });

    expect(await recentlyDeleted(other.emil, other.tripId)).toEqual({ stops: [], items: [] });
    expect((await browser().readDeleted(tripId)).status).toBe(401);
  });
});

describe("restoring an Item", () => {
  test("puts it back where it was, as it was", async () => {
    const { tripId, emil, monterey } = await tripWithStops();
    const flight = await addedItem(emil, tripId, { category: "flight", title: "Flight out", cost: 4200 });
    const aquarium = await addedItem(emil, tripId, { title: "Aquarium", stopId: monterey.id, notes: "Book ahead" });
    await emil.updateItem(tripId, aquarium.id, { status: "booked" });
    const booked = { ...aquarium, status: "booked" };
    await emil.deleteItem(tripId, flight.id);
    await emil.deleteItem(tripId, aquarium.id);

    const response = await emil.restoreItem(tripId, aquarium.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ item: booked });
    await emil.restoreItem(tripId, flight.id);

    expect(await itemsAsListed(emil, tripId)).toEqual([flight, booked]);
    expect(await recentlyDeleted(emil, tripId)).toEqual({ stops: [], items: [] });
  });

  test("puts it on the Trip when its Stop is still deleted", async () => {
    const { tripId, emil, monterey } = await tripWithStops();
    const before = await addedItem(emil, tripId, { title: "Whale watching", stopId: monterey.id });
    const together = await addedItem(emil, tripId, { title: "Aquarium", stopId: monterey.id });
    await emil.deleteItem(tripId, before.id);
    vi.advanceTimersByTime(HOUR);
    await emil.deleteStop(tripId, monterey.id);

    for (const item of [before, together]) {
      const response = await emil.restoreItem(tripId, item.id);
      expect(await response.json()).toEqual({ item: { ...item, stopId: null } });
    }

    expect(await itemsAsListed(emil, tripId)).toEqual([
      { ...before, stopId: null },
      { ...together, stopId: null },
    ]);
    // Restored on its own, an Item no longer goes with its Stop.
    expect(await recentlyDeleted(emil, tripId)).toMatchObject({ stops: [{ name: "Monterey", itemCount: 0 }], items: [] });
    await emil.restoreStop(tripId, monterey.id);
    expect(await itemsAsListed(emil, tripId)).toMatchObject([{ stopId: null }, { stopId: null }]);
  });

  test("puts it back on its Stop once the Stop has been restored", async () => {
    const { tripId, emil, monterey } = await tripWithStops();
    const whales = await addedItem(emil, tripId, { title: "Whale watching", stopId: monterey.id });
    await emil.deleteItem(tripId, whales.id);
    vi.advanceTimersByTime(HOUR);
    await emil.deleteStop(tripId, monterey.id);
    await emil.restoreStop(tripId, monterey.id);

    await emil.restoreItem(tripId, whales.id);

    expect(await itemsAsListed(emil, tripId)).toEqual([whales]);
  });

  test("is refused for an Item that is not deleted, unknown or of another Trip", async () => {
    const { tripId, emil } = await tripWithStops();
    const flight = await addedItem(emil, tripId, { category: "flight", title: "Flight out" });
    const other = await unlockedTrip({ name: "Another Trip" });
    const theirs = await addedItem(other.emil, other.tripId, { title: "Theirs" });
    await other.emil.deleteItem(other.tripId, theirs.id);

    expect((await emil.restoreItem(tripId, flight.id)).status).toBe(404);
    expect((await emil.restoreItem(tripId, "not-an-item")).status).toBe(404);
    expect((await emil.restoreItem(tripId, theirs.id)).status).toBe(404);
    await emil.deleteItem(tripId, flight.id);
    expect((await browser().restoreItem(tripId, flight.id)).status).toBe(401);
    expect(await recentlyDeleted(other.emil, other.tripId)).toMatchObject({ items: [{ title: "Theirs" }] });
  });
});

describe("restoring a Stop", () => {
  test("puts it back in the Route where it was", async () => {
    const { tripId, emil, monterey } = await tripWithStops();
    await emil.updateStop(tripId, monterey.id, { arrivalDate: "2027-07-02", departureDate: "2027-07-04" });
    const { stop: asItWas } = await (await emil.readStop(tripId, monterey.id)).json();
    await emil.deleteStop(tripId, monterey.id);
    expect(await stopNames(emil, tripId)).toEqual(["San Francisco", "Los Angeles"]);

    const response = await emil.restoreStop(tripId, monterey.id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stop: asItWas });
    expect(await stopNames(emil, tripId)).toEqual(["San Francisco", "Monterey", "Los Angeles"]);
    expect(await recentlyDeleted(emil, tripId)).toEqual({ stops: [], items: [] });
  });

  test("restores exactly the Items that were deleted with it", async () => {
    const { tripId, emil, monterey, losAngeles } = await tripWithStops();
    const whales = await addedItem(emil, tripId, { title: "Whale watching", stopId: monterey.id });
    const aquarium = await addedItem(emil, tripId, { title: "Aquarium", stopId: monterey.id });
    const cannery = await addedItem(emil, tripId, { title: "Cannery Row", stopId: monterey.id });
    const pier = await addedItem(emil, tripId, { title: "Pier", stopId: losAngeles.id });
    const flight = await addedItem(emil, tripId, { category: "flight", title: "Flight out" });
    await emil.deleteItem(tripId, whales.id);
    vi.advanceTimersByTime(HOUR);
    await emil.deleteStop(tripId, monterey.id);
    vi.advanceTimersByTime(HOUR);
    await emil.deleteItem(tripId, pier.id);
    await emil.deleteItem(tripId, flight.id);

    await emil.restoreStop(tripId, monterey.id);

    expect(await itemsAsListed(emil, tripId)).toEqual([aquarium, cannery]);
    const { stops, items } = await recentlyDeleted(emil, tripId);
    expect(stops).toEqual([]);
    expect(items.map(({ title }) => title).sort()).toEqual(["Flight out", "Pier", "Whale watching"]);
    expect(items.find(({ title }) => title === "Whale watching")).toMatchObject({
      stop: { name: "Monterey", onRoute: true },
    });
  });

  test("is refused for a Stop that is not deleted, unknown or of another Trip", async () => {
    const { tripId, emil, monterey } = await tripWithStops();
    const other = await unlockedTrip({ name: "Another Trip" });
    const theirs = await addedStop(other.emil, other.tripId, "Theirs");
    await other.emil.deleteStop(other.tripId, theirs.id);

    expect((await emil.restoreStop(tripId, monterey.id)).status).toBe(404);
    expect((await emil.restoreStop(tripId, "not-a-stop")).status).toBe(404);
    expect((await emil.restoreStop(tripId, theirs.id)).status).toBe(404);
    await emil.deleteStop(tripId, monterey.id);
    expect((await browser().restoreStop(tripId, monterey.id)).status).toBe(401);
    expect(await stopNames(emil, tripId)).toEqual(["San Francisco", "Los Angeles"]);
  });
});

describe("a deleted Stop and its Items", () => {
  test("are in neither the Route, the Budget, the warnings nor the maps until restored", async () => {
    const place = { label: "Monterey, California", latitude: 36.6, longitude: -121.89 };
    const { tripId, emil } = await unlockedTrip();
    const { stop } = await (
      await emil.addStop(tripId, { name: "Monterey", arrivalDate: "2027-07-02", departureDate: "2027-07-03", place })
    ).json();
    const aquarium = await addedItem(emil, tripId, { title: "Aquarium", stopId: stop.id, cost: 500, place });
    await emil.updateItem(tripId, aquarium.id, { status: "booked" });

    async function seen() {
      const [budget, warnings, map] = await Promise.all(
        [emil.readBudget(tripId), emil.readWarnings(tripId), emil.readMap(tripId)].map(async (response) =>
          (await response).json(),
        ),
      );
      const closeUp = await emil.readCloseUp(tripId, stop.id);
      return {
        route: await stopNames(emil, tripId),
        total: budget.budget.total,
        warnings: warnings.warnings.length,
        pins: map.route.pins.length,
        closeUp: closeUp.status,
      };
    }

    const before = await seen();
    expect(before).toEqual({ route: ["Monterey"], total: 500, warnings: 1, pins: 1, closeUp: 200 });

    await emil.deleteStop(tripId, stop.id);
    expect(await seen()).toEqual({ route: [], total: 0, warnings: 0, pins: 0, closeUp: 404 });

    await emil.restoreStop(tripId, stop.id);
    expect(await seen()).toEqual(before);
  });
});

describe("after 30 days", () => {
  test("a deleted Stop or Item is no longer listed and cannot be restored", async () => {
    const { tripId, emil, monterey } = await tripWithStops();
    const flight = await addedItem(emil, tripId, { category: "flight", title: "Flight out" });
    await emil.deleteStop(tripId, monterey.id);
    await emil.deleteItem(tripId, flight.id);

    vi.advanceTimersByTime(30 * DAY - HOUR);
    expect(await recentlyDeleted(emil, tripId)).toMatchObject({
      stops: [{ name: "Monterey", daysLeft: 1 }],
      items: [{ title: "Flight out", daysLeft: 1 }],
    });

    vi.advanceTimersByTime(2 * HOUR);
    expect(await recentlyDeleted(emil, tripId)).toEqual({ stops: [], items: [] });
    expect((await emil.restoreStop(tripId, monterey.id)).status).toBe(404);
    expect((await emil.restoreItem(tripId, flight.id)).status).toBe(404);
  });

  test("the scheduled job purges them, and nothing else", async () => {
    const { tripId, emil, monterey, losAngeles } = await tripWithStops();
    await addedItem(emil, tripId, { title: "Aquarium", stopId: monterey.id });
    const flight = await addedItem(emil, tripId, { category: "flight", title: "Flight out" });
    const pier = await addedItem(emil, tripId, { title: "Pier", stopId: losAngeles.id });
    const kept = await addedItem(emil, tripId, { title: "Griffith Observatory", stopId: losAngeles.id });
    await emil.deleteStop(tripId, monterey.id);
    await emil.deleteItem(tripId, flight.id);
    vi.advanceTimersByTime(10 * DAY);
    await emil.deleteItem(tripId, pier.id);
    expect(await stored()).toEqual({ stops: 3, items: 4 });

    // Nothing is 30 days old yet.
    vi.advanceTimersByTime(20 * DAY - HOUR);
    expect(await (await runPurge(CRON_SECRET)).json()).toEqual({ purged: { stops: 0, items: 0 } });
    expect(await stored()).toEqual({ stops: 3, items: 4 });

    vi.advanceTimersByTime(2 * HOUR);
    const response = await runPurge(CRON_SECRET);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ purged: { stops: 1, items: 2 } });
    expect(await stored()).toEqual({ stops: 2, items: 2 });

    expect(await stopNames(emil, tripId)).toEqual(["San Francisco", "Los Angeles"]);
    expect(await itemsAsListed(emil, tripId)).toEqual([kept]);
    expect(await recentlyDeleted(emil, tripId)).toMatchObject({ stops: [], items: [{ title: "Pier", daysLeft: 10 }] });
  });

  test("the job runs for nobody but the scheduler", async () => {
    const { tripId, emil, monterey } = await tripWithStops();
    await emil.deleteStop(tripId, monterey.id);
    vi.advanceTimersByTime(31 * DAY);

    expect((await runPurge()).status).toBe(401);
    expect((await runPurge("a-guess")).status).toBe(401);
    expect(await stored()).toEqual({ stops: 3, items: 0 });
  });
});

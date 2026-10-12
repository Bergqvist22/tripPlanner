import { beforeEach, describe, expect, test } from "vitest";
import { browser, emptyDatabase, unlockedTrip } from "./support";

const monterey = { label: "Monterey, California, United States", latitude: 36.6002, longitude: -121.8947 };
const aquarium = { label: "Monterey Bay Aquarium, Monterey, California", latitude: 36.6183, longitude: -121.9018 };
const canneryRow = { label: "Cannery Row, Monterey, California", latitude: 36.6159, longitude: -121.9006 };
const wharf = { label: "Old Fisherman's Wharf, Monterey, California", latitude: 36.6046, longitude: -121.8925 };

beforeEach(emptyDatabase);

type Traveller = ReturnType<typeof browser>;

async function addedStop(traveller: Traveller, tripId: string, stop: Record<string, unknown>) {
  const response = await traveller.addStop(tripId, stop);
  return (await response.json()).stop as { id: string };
}

async function addedItem(traveller: Traveller, tripId: string, item: Record<string, unknown>) {
  const response = await traveller.addItem(tripId, item);
  expect(response.status).toBe(201);
  return (await response.json()).item as { id: string } & Record<string, unknown>;
}

async function itemAsRead(traveller: Traveller, tripId: string, itemId: string) {
  return (await (await traveller.readItem(tripId, itemId)).json()).item;
}

async function closeUpAsRead(traveller: Traveller, tripId: string, stopId: string) {
  const response = await traveller.readCloseUp(tripId, stopId);
  expect(response.status).toBe(200);
  return (await response.json()).closeUp as { pins: Record<string, unknown>[] };
}

// The Items the close-up map has a pin for.
async function pinsAsRead(traveller: Traveller, tripId: string, stopId: string) {
  const { pins } = await closeUpAsRead(traveller, tripId, stopId);
  return pins.map((pin) => pin.title);
}

// A Trip with a Stop in Monterey and one in Los Angeles.
async function tripWithStops() {
  const { tripId, emil } = await unlockedTrip();
  const stop = await addedStop(emil, tripId, { name: "Monterey", place: monterey });
  const losAngeles = await addedStop(emil, tripId, { name: "Los Angeles" });
  return { tripId, emil, stop, losAngeles };
}

describe("the place of an Item", () => {
  test("is not needed", async () => {
    const { tripId, emil } = await tripWithStops();

    const item = await addedItem(emil, tripId, { category: "activity", title: "Whale watching" });

    expect(item.place).toBeNull();
  });

  test.each(["flight", "car_rental", "accommodation", "activity", "food", "transport", "other"])(
    "can be given to a new Item of the Category %s",
    async (category) => {
      const { tripId, emil } = await tripWithStops();

      const item = await addedItem(emil, tripId, {
        category,
        title: "Somewhere on Cannery Row",
        date: "2027-07-02",
        endDate: "2027-07-04",
        place: canneryRow,
      });

      expect(item.place).toEqual(canneryRow);
      expect(await itemAsRead(emil, tripId, item.id)).toEqual(item);
    },
  );

  test("can be given, changed and taken away afterwards", async () => {
    const { tripId, emil } = await tripWithStops();
    const item = await addedItem(emil, tripId, { category: "activity", title: "Aquarium", notes: "Opens at 10." });

    const given = await emil.updateItem(tripId, item.id, { place: canneryRow });
    expect(given.status).toBe(200);
    expect((await given.json()).item).toEqual({ ...item, place: canneryRow });

    await emil.updateItem(tripId, item.id, { place: aquarium });
    expect(await itemAsRead(emil, tripId, item.id)).toEqual({ ...item, place: aquarium });

    await emil.updateItem(tripId, item.id, { place: null });
    expect(await itemAsRead(emil, tripId, item.id)).toEqual(item);
  });

  test("stays when something else about the Item is changed", async () => {
    const { tripId, emil } = await tripWithStops();
    const item = await addedItem(emil, tripId, { category: "activity", title: "Aquarium", place: aquarium });

    await emil.updateItem(tripId, item.id, { title: "Monterey Bay Aquarium" });

    expect((await itemAsRead(emil, tripId, item.id)).place).toEqual(aquarium);
  });

  test.each([
    ["text", "Cannery Row"],
    ["a place without a label", { latitude: 36.6, longitude: -121.9 }],
    ["a place off the map", { label: "Nowhere", latitude: 91, longitude: 0 }],
  ])("cannot be %s", async (_, place) => {
    const { tripId, emil } = await tripWithStops();
    const item = await addedItem(emil, tripId, { category: "activity", title: "Aquarium", place: aquarium });

    const added = await emil.addItem(tripId, { category: "food", title: "Chowder", place });
    const changed = await emil.updateItem(tripId, item.id, { place });

    for (const response of [added, changed]) {
      expect(response.status).toBe(400);
      expect((await response.json()).errors.place).toEqual(expect.any(String));
    }
    expect(await itemAsRead(emil, tripId, item.id)).toEqual(item);
  });
});

describe("the close-up map of a Stop", () => {
  test("has a pin for each of the Stop's Items that has a place", async () => {
    const { tripId, emil, stop } = await tripWithStops();
    const hostel = await addedItem(emil, tripId, {
      stopId: stop.id,
      category: "accommodation",
      title: "Cannery Row Hostel",
      date: "2027-07-02",
      endDate: "2027-07-04",
      place: canneryRow,
    });
    const visit = await addedItem(emil, tripId, {
      stopId: stop.id,
      category: "activity",
      title: "Aquarium",
      place: aquarium,
    });
    await addedItem(emil, tripId, { stopId: stop.id, category: "food", title: "Chowder somewhere" });

    expect(await closeUpAsRead(emil, tripId, stop.id)).toEqual({
      pins: [
        { itemId: hostel.id, title: "Cannery Row Hostel", category: "accommodation", status: "suggestion", ...canneryRow },
        { itemId: visit.id, title: "Aquarium", category: "activity", status: "suggestion", ...aquarium },
      ],
    });
  });

  test("has no pins for a Stop whose Items have no place", async () => {
    const { tripId, emil, stop } = await tripWithStops();
    await addedItem(emil, tripId, { stopId: stop.id, category: "food", title: "Chowder somewhere" });

    expect(await closeUpAsRead(emil, tripId, stop.id)).toEqual({ pins: [] });
  });

  test("tells the Status of each Item, Rejected ones too, for the map to dim or leave out", async () => {
    const { tripId, emil, stop } = await tripWithStops();
    const at = { stopId: stop.id, category: "food" };
    const statuses = ["suggestion", "selected", "booked", "rejected"];
    for (const status of statuses) {
      const item = await addedItem(emil, tripId, { ...at, title: status, place: wharf });
      await emil.updateItem(tripId, item.id, { status });
    }

    const { pins } = await closeUpAsRead(emil, tripId, stop.id);

    expect(pins.map((pin) => pin.status)).toEqual(statuses);
  });

  test("leaves out Items of another Stop and of the whole Trip", async () => {
    const { tripId, emil, stop, losAngeles } = await tripWithStops();
    await addedItem(emil, tripId, { stopId: stop.id, category: "activity", title: "Aquarium", place: aquarium });
    await addedItem(emil, tripId, { stopId: losAngeles.id, category: "activity", title: "Griffith Observatory", place: wharf });
    await addedItem(emil, tripId, { category: "car_rental", title: "Rental car", place: canneryRow });

    expect(await pinsAsRead(emil, tripId, stop.id)).toEqual(["Aquarium"]);
    expect(await pinsAsRead(emil, tripId, losAngeles.id)).toEqual(["Griffith Observatory"]);
  });

  test("follows an Item that is moved, given another place, or deleted", async () => {
    const { tripId, emil, stop, losAngeles } = await tripWithStops();
    const visit = await addedItem(emil, tripId, { stopId: stop.id, category: "activity", title: "Aquarium", place: aquarium });
    const dinner = await addedItem(emil, tripId, { stopId: stop.id, category: "food", title: "Chowder", place: wharf });

    await emil.updateItem(tripId, dinner.id, { place: canneryRow });
    const { pins } = await closeUpAsRead(emil, tripId, stop.id);
    expect(pins[1]).toMatchObject({ title: "Chowder", ...canneryRow });

    await emil.updateItem(tripId, dinner.id, { stopId: losAngeles.id });
    expect(await pinsAsRead(emil, tripId, stop.id)).toEqual(["Aquarium"]);
    expect(await pinsAsRead(emil, tripId, losAngeles.id)).toEqual(["Chowder"]);

    await emil.deleteItem(tripId, visit.id);
    await emil.updateItem(tripId, dinner.id, { place: null });
    expect(await pinsAsRead(emil, tripId, stop.id)).toEqual([]);
    expect(await pinsAsRead(emil, tripId, losAngeles.id)).toEqual([]);
  });

  test("is not read for a Stop that is deleted, unknown or of another Trip", async () => {
    const { tripId, emil, stop, losAngeles } = await tripWithStops();
    const oslo = await unlockedTrip({ name: "Oslo weekend" });
    await emil.deleteStop(tripId, losAngeles.id);

    for (const response of [
      await emil.readCloseUp(tripId, losAngeles.id),
      await emil.readCloseUp(tripId, "4b1c6c2e-0d0f-4a55-9d3a-0f6e3f1f6f11"),
      await emil.readCloseUp(tripId, "not-a-stop"),
      await oslo.emil.readCloseUp(oslo.tripId, stop.id),
    ]) {
      expect(response.status).toBe(404);
    }
  });

  test("is not read from a browser that has not unlocked the Trip", async () => {
    const { tripId, emil, stop } = await tripWithStops();
    await addedItem(emil, tripId, { stopId: stop.id, category: "activity", title: "Aquarium", place: aquarium });

    const response = await browser().readCloseUp(tripId, stop.id);

    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty("closeUp");
  });
});

describe("the overview map", () => {
  test("still shows only Stops and the Route when Items have places", async () => {
    const { tripId, emil, stop } = await tripWithStops();
    const before = await (await emil.readMap(tripId)).json();
    await addedItem(emil, tripId, { stopId: stop.id, category: "activity", title: "Aquarium", place: aquarium });
    await addedItem(emil, tripId, { category: "car_rental", title: "Rental car", place: canneryRow });

    const { route } = await (await emil.readMap(tripId)).json();

    expect({ route }).toEqual(before);
    expect(route.pins).toEqual([{ stopId: stop.id, name: "Monterey", number: 1, ...monterey }]);
  });
});

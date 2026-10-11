import { beforeEach, describe, expect, test } from "vitest";
import { browser, driveBetween, emptyDatabase, placeSearchService, routeCalculationService, unlockedTrip } from "./support";

const sanFrancisco = { label: "San Francisco, California, United States", latitude: 37.7793, longitude: -122.4193 };
const monterey = { label: "Monterey, California, United States", latitude: 36.6002, longitude: -121.8947 };
const montereyPark = { label: "Monterey Park, California, United States", latitude: 34.0625, longitude: -118.1228 };
const losAngeles = { label: "Los Angeles, California, United States", latitude: 34.0537, longitude: -118.2428 };

let service: ReturnType<typeof placeSearchService>;

beforeEach(emptyDatabase);
beforeEach(() => {
  service = placeSearchService([sanFrancisco, monterey, montereyPark, losAngeles]);
  routeCalculationService();
});

const alongRoad = (from: typeof monterey, to: typeof monterey) => ({ points: driveBetween(from, to).road, alongRoad: true });

type Traveller = ReturnType<typeof browser>;

async function addedStop(traveller: Traveller, tripId: string, stop: Record<string, unknown>) {
  const response = await traveller.addStop(tripId, stop);
  expect(response.status).toBe(201);
  return (await response.json()).stop as { id: string } & Record<string, unknown>;
}

async function stopAsRead(traveller: Traveller, tripId: string, stopId: string) {
  return (await (await traveller.readStop(tripId, stopId)).json()).stop;
}

async function routeAsRead(traveller: Traveller, tripId: string) {
  const response = await traveller.readMap(tripId);
  expect(response.status).toBe(200);
  return (await response.json()).route;
}

// The Stops the map has a pin for, in the order the line joins them.
async function pinsAsRead(traveller: Traveller, tripId: string) {
  const { pins } = await routeAsRead(traveller, tripId);
  return (pins as { name: string }[]).map((pin) => pin.name);
}

describe("searching for a place", () => {
  test("finds places with a label and coordinates", async () => {
    const { tripId, emil } = await unlockedTrip();

    const response = await emil.searchPlaces(tripId, "monterey");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ places: [monterey, montereyPark] });
  });

  test("finds nothing when no place matches", async () => {
    const { tripId, emil } = await unlockedTrip();

    const response = await emil.searchPlaces(tripId, "Atlantis");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ places: [] });
  });

  test("searches for what was typed without the spaces around it", async () => {
    const { tripId, emil } = await unlockedTrip();

    await emil.searchPlaces(tripId, "  Los Angeles ");

    expect(service.searches).toEqual(["Los Angeles"]);
  });

  test.each([undefined, "", "  ", "m"])("does not ask the service about %j", async (query) => {
    const { tripId, emil } = await unlockedTrip();

    const response = await emil.searchPlaces(tripId, query);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ places: [] });
    expect(service.searches).toEqual([]);
  });

  test("is refused when what is searched for is too long", async () => {
    const { tripId, emil } = await unlockedTrip();

    const response = await emil.searchPlaces(tripId, "m".repeat(201));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toEqual(expect.any(String));
    expect(service.searches).toEqual([]);
  });

  test("leaves out what the service answers that is not a point on the map", async () => {
    const { tripId, emil } = await unlockedTrip();
    service.places = [
      monterey,
      { label: "Monterey Nowhere", latitude: 91, longitude: 0 },
      { label: "Monterey Elsewhere", latitude: 0, longitude: Number.NaN },
      { label: "  ", latitude: 0, longitude: 0 },
    ];

    const response = await emil.searchPlaces(tripId, "monterey");

    expect(await response.json()).toEqual({ places: [monterey] });
  });

  test("says so when the service cannot be reached", async () => {
    const { tripId, emil } = await unlockedTrip();
    service.down = true;

    const response = await emil.searchPlaces(tripId, "monterey");

    expect(response.status).toBe(502);
    const answer = await response.json();
    expect(answer.error).toEqual(expect.any(String));
    expect(answer).not.toHaveProperty("places");
  });

  test("is refused to a browser that has not unlocked the Trip", async () => {
    const { tripId } = await unlockedTrip();

    const response = await browser().searchPlaces(tripId, "monterey");

    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty("places");
    expect(service.searches).toEqual([]);
  });
});

describe("the place of a Stop", () => {
  test("is stored with its label and coordinates when the Stop is added", async () => {
    const { tripId, emil } = await unlockedTrip();

    const stop = await addedStop(emil, tripId, { name: "Monterey", place: monterey });

    expect(stop.place).toEqual(monterey);
    expect(await stopAsRead(emil, tripId, stop.id)).toEqual(stop);
    expect((await (await emil.listStops(tripId)).json()).stops).toEqual([stop]);
  });

  test("is not needed: a Stop without one works as before", async () => {
    const { tripId, emil } = await unlockedTrip();

    const stop = await addedStop(emil, tripId, { name: "Somewhere along Highway 1" });
    const response = await emil.updateStop(tripId, stop.id, { arrivalDate: "2027-07-02", notes: "Lunch" });

    expect(response.status).toBe(200);
    expect((await response.json()).stop).toMatchObject({ place: null, arrivalDate: "2027-07-02", notes: "Lunch" });
  });

  test("can be given to a Stop later, changed and taken away again", async () => {
    const { tripId, emil } = await unlockedTrip();
    const stop = await addedStop(emil, tripId, { name: "Monterey" });

    const given = await emil.updateStop(tripId, stop.id, { place: montereyPark });
    expect((await given.json()).stop.place).toEqual(montereyPark);

    await emil.updateStop(tripId, stop.id, { place: monterey });
    expect((await stopAsRead(emil, tripId, stop.id)).place).toEqual(monterey);

    await emil.updateStop(tripId, stop.id, { place: null });
    expect((await stopAsRead(emil, tripId, stop.id)).place).toBeNull();
  });

  test("is left alone by a change to something else", async () => {
    const { tripId, emil } = await unlockedTrip();
    const stop = await addedStop(emil, tripId, { name: "Montery", place: monterey });

    await emil.updateStop(tripId, stop.id, { name: "Monterey" });

    expect(await stopAsRead(emil, tripId, stop.id)).toMatchObject({ name: "Monterey", place: monterey });
  });

  test("does not depend on the place-search service", async () => {
    const { tripId, emil } = await unlockedTrip();
    service.down = true;
    expect((await emil.searchPlaces(tripId, "monterey")).status).toBe(502);

    const withoutPlace = await addedStop(emil, tripId, { name: "Monterey" });
    const withPlace = await addedStop(emil, tripId, { name: "Los Angeles", place: losAngeles });

    expect(withoutPlace.place).toBeNull();
    expect(withPlace.place).toEqual(losAngeles);
  });

  test.each([
    "Monterey",
    { label: "Monterey" },
    { ...monterey, label: "  " },
    { ...monterey, latitude: 90.5 },
    { ...monterey, longitude: -181 },
    { ...monterey, latitude: "36.6" },
  ])("is refused when it is %j", async (place) => {
    const { tripId, emil } = await unlockedTrip();
    const stop = await addedStop(emil, tripId, { name: "Monterey", place: monterey });

    const added = await emil.addStop(tripId, { name: "Los Angeles", place });
    const changed = await emil.updateStop(tripId, stop.id, { place });

    for (const response of [added, changed]) {
      expect(response.status).toBe(400);
      expect((await response.json()).errors.place).toEqual(expect.any(String));
    }
    expect((await (await emil.listStops(tripId)).json()).stops).toEqual([stop]);
  });
});

describe("the overview map", () => {
  test("has a pin per Stop with a place, in Route order", async () => {
    const { tripId, emil } = await unlockedTrip();
    const first = await addedStop(emil, tripId, { name: "The City", place: sanFrancisco });
    const second = await addedStop(emil, tripId, { name: "Monterey", place: monterey });
    const third = await addedStop(emil, tripId, { name: "LA", place: losAngeles });

    expect(await routeAsRead(emil, tripId)).toEqual({
      pins: [
        { stopId: first.id, name: "The City", number: 1, ...sanFrancisco },
        { stopId: second.id, name: "Monterey", number: 2, ...monterey },
        { stopId: third.id, name: "LA", number: 3, ...losAngeles },
      ],
      lines: [alongRoad(sanFrancisco, monterey), alongRoad(monterey, losAngeles)],
      stopsWithoutPlace: 0,
    });
  });

  test("is empty for a Trip without Stops", async () => {
    const { tripId, emil } = await unlockedTrip();

    expect(await routeAsRead(emil, tripId)).toEqual({ pins: [], lines: [], stopsWithoutPlace: 0 });
  });

  test("leaves out a Stop without a place, and joins the Stops around it", async () => {
    const { tripId, emil } = await unlockedTrip();
    await addedStop(emil, tripId, { name: "San Francisco", place: sanFrancisco });
    await addedStop(emil, tripId, { name: "Big Sur" });
    await addedStop(emil, tripId, { name: "Los Angeles", place: losAngeles });

    const route = await routeAsRead(emil, tripId);

    // Each pin keeps the number its Stop has on the Route.
    expect(route.pins.map((pin: { name: string; number: number }) => [pin.name, pin.number])).toEqual([
      ["San Francisco", 1],
      ["Los Angeles", 3],
    ]);
    expect(route.stopsWithoutPlace).toBe(1);
    // No Leg runs between the two, so no road is drawn: a straight line joins them.
    expect(route.lines).toEqual([
      {
        points: [
          [sanFrancisco.latitude, sanFrancisco.longitude],
          [losAngeles.latitude, losAngeles.longitude],
        ],
        alongRoad: false,
      },
    ]);
  });

  test("follows the Route as Stops are added, reordered and deleted", async () => {
    const { tripId, emil } = await unlockedTrip();
    const first = await addedStop(emil, tripId, { name: "San Francisco", place: sanFrancisco });
    const second = await addedStop(emil, tripId, { name: "Monterey", place: monterey });
    expect(await pinsAsRead(emil, tripId)).toEqual(["San Francisco", "Monterey"]);

    const third = await addedStop(emil, tripId, { name: "Los Angeles", place: losAngeles });
    expect(await pinsAsRead(emil, tripId)).toEqual(["San Francisco", "Monterey", "Los Angeles"]);

    await emil.reorderStops(tripId, [third.id, first.id, second.id]);
    expect(await pinsAsRead(emil, tripId)).toEqual(["Los Angeles", "San Francisco", "Monterey"]);

    await emil.deleteStop(tripId, first.id);
    expect(await routeAsRead(emil, tripId)).toEqual({
      pins: [
        { stopId: third.id, name: "Los Angeles", number: 1, ...losAngeles },
        { stopId: second.id, name: "Monterey", number: 2, ...monterey },
      ],
      lines: [alongRoad(losAngeles, monterey)],
      stopsWithoutPlace: 0,
    });
  });

  test("moves a pin when its Stop is given a new place, and drops it when the place is taken away", async () => {
    const { tripId, emil } = await unlockedTrip();
    const stop = await addedStop(emil, tripId, { name: "Monterey", place: montereyPark });

    await emil.updateStop(tripId, stop.id, { place: monterey });
    expect((await routeAsRead(emil, tripId)).pins).toEqual([{ stopId: stop.id, name: "Monterey", number: 1, ...monterey }]);

    await emil.updateStop(tripId, stop.id, { place: null });
    expect(await routeAsRead(emil, tripId)).toEqual({ pins: [], lines: [], stopsWithoutPlace: 1 });
  });

  test("is shown only to a browser that has unlocked the Trip", async () => {
    const { tripId, emil } = await unlockedTrip();
    await addedStop(emil, tripId, { name: "Monterey", place: monterey });

    const response = await browser().readMap(tripId);

    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty("route");
  });

  test("shows the Stops of that Trip alone", async () => {
    const { tripId, emil } = await unlockedTrip();
    const oslo = await unlockedTrip({ name: "Weekend in Oslo" });
    await addedStop(emil, tripId, { name: "Monterey", place: monterey });
    await addedStop(oslo.emil, oslo.tripId, { name: "Oslo", place: { label: "Oslo, Norway", latitude: 59.9, longitude: 10.7 } });

    expect(await pinsAsRead(emil, tripId)).toEqual(["Monterey"]);
  });
});

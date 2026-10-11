import { beforeEach, describe, expect, test } from "vitest";
import { browser, driveBetween, emptyDatabase, routeCalculationService, unlockedTrip } from "./support";

const sanFrancisco = { label: "San Francisco, California, United States", latitude: 37.7793, longitude: -122.4193 };
const monterey = { label: "Monterey, California, United States", latitude: 36.6002, longitude: -121.8947 };
const losAngeles = { label: "Los Angeles, California, United States", latitude: 34.0537, longitude: -118.2428 };
const sanDiego = { label: "San Diego, California, United States", latitude: 32.7174, longitude: -117.1628 };

type Place = typeof monterey;

// What the service makes of the drive between two places, as a Leg shows it.
function minutesBetween(from: Place, to: Place) {
  return driveBetween(from, to).durationSeconds / 60;
}

let service: ReturnType<typeof routeCalculationService>;

beforeEach(emptyDatabase);
beforeEach(() => {
  service = routeCalculationService();
});

type Traveller = ReturnType<typeof browser>;

async function addedStop(traveller: Traveller, tripId: string, name: string, place?: Place) {
  const response = await traveller.addStop(tripId, { name, place });
  expect(response.status).toBe(201);
  return (await response.json()).stop.id as string;
}

// A Trip with these places as its Stops, in this order.
async function tripThrough(...places: Place[]) {
  const { tripId, emil } = await unlockedTrip();
  const stopIds: string[] = [];
  for (const place of places) stopIds.push(await addedStop(emil, tripId, place.label.split(",")[0], place));
  return { tripId, emil, stopIds };
}

async function travelAsRead(traveller: Traveller, tripId: string) {
  const response = await traveller.readLegs(tripId);
  expect(response.status).toBe(200);
  return (await response.json()).travel;
}

async function legsAsRead(traveller: Traveller, tripId: string) {
  return (await travelAsRead(traveller, tripId)).legs;
}

async function changedLeg(traveller: Traveller, tripId: string, from: string, to: string, changes: unknown) {
  const response = await traveller.updateLeg(tripId, from, to, changes);
  expect(response.status).toBe(200);
  return (await response.json()).leg;
}

describe("the Legs of a Trip", () => {
  test("run between each pair of consecutive Stops, in Route order", async () => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, monterey, losAngeles);
    const [first, second, third] = stopIds;

    const legs = await legsAsRead(emil, tripId);

    expect(legs.map((leg: { fromStopId: string; toStopId: string }) => [leg.fromStopId, leg.toStopId])).toEqual([
      [first, second],
      [second, third],
    ]);
  });

  test.each([0, 1])("are none for a Trip with %i Stops", async (count) => {
    const { tripId, emil } = await tripThrough(...[sanFrancisco].slice(0, count));

    expect(await travelAsRead(emil, tripId)).toEqual({ legs: [], totalTravelMinutes: 0, legsWithoutTravelTime: 0 });
    expect(service.asked).toEqual([]);
  });

  test("follow the Route when a Stop between two others is deleted", async () => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, monterey, losAngeles);
    const [first, second, third] = stopIds;

    await emil.deleteStop(tripId, second);

    expect(await legsAsRead(emil, tripId)).toMatchObject([
      { fromStopId: first, toStopId: third, calculatedDurationMinutes: minutesBetween(sanFrancisco, losAngeles) },
    ]);
  });

  test("are shown only to a browser that has unlocked the Trip", async () => {
    const { tripId, stopIds } = await tripThrough(sanFrancisco, monterey);

    const read = await browser().readLegs(tripId);
    const changed = await browser().updateLeg(tripId, stopIds[0], stopIds[1], { travelMode: "flight" });

    expect(read.status).toBe(401);
    expect(await read.json()).not.toHaveProperty("travel");
    expect(changed.status).toBe(401);
    expect(service.asked).toEqual([]);
  });
});

describe("a Drive", () => {
  test("is what a Leg is until told otherwise, with a calculated travel time and distance", async () => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, monterey);
    const drive = driveBetween(sanFrancisco, monterey);

    expect(await legsAsRead(emil, tripId)).toEqual([
      {
        fromStopId: stopIds[0],
        toStopId: stopIds[1],
        travelMode: "drive",
        durationMinutes: drive.durationSeconds / 60,
        manualDurationMinutes: null,
        calculatedDurationMinutes: drive.durationSeconds / 60,
        distanceMeters: drive.distanceMeters,
        calculation: "calculated",
      },
    ]);
  });

  test("is calculated once for a pair of Stops", async () => {
    const { tripId, emil } = await tripThrough(sanFrancisco, monterey, losAngeles);

    const first = await legsAsRead(emil, tripId);
    const again = await legsAsRead(emil, tripId);
    await emil.readMap(tripId);

    expect(again).toEqual(first);
    expect(service.asked).toEqual([
      [sanFrancisco, monterey],
      [monterey, losAngeles],
    ].map((pair) => pair.map(({ latitude, longitude }) => ({ label: expect.any(String), latitude, longitude }))));
  });

  test("is calculated for the new pairs alone when the Route is reordered", async () => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, monterey, losAngeles, sanDiego);
    const [first, second, third, fourth] = stopIds;
    await legsAsRead(emil, tripId);
    service.asked.length = 0;

    // San Francisco – Monterey stays as it was.
    await emil.reorderStops(tripId, [first, second, fourth, third]);
    const legs = await legsAsRead(emil, tripId);

    expect(legs.map((leg: { calculatedDurationMinutes: number }) => leg.calculatedDurationMinutes)).toEqual([
      minutesBetween(sanFrancisco, monterey),
      minutesBetween(monterey, sanDiego),
      minutesBetween(sanDiego, losAngeles),
    ]);
    expect(service.asked).toHaveLength(2);

    // Back in the first order every pair is known.
    service.asked.length = 0;
    await emil.reorderStops(tripId, stopIds);
    expect(await legsAsRead(emil, tripId)).toHaveLength(3);
    expect(service.asked).toEqual([]);
  });

  test("is calculated again when one of its Stops is given another place", async () => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, monterey, losAngeles, sanDiego);
    await legsAsRead(emil, tripId);
    service.asked.length = 0;

    await emil.updateStop(tripId, stopIds[1], { place: sanDiego });
    const legs = await legsAsRead(emil, tripId);

    expect(legs.map((leg: { calculatedDurationMinutes: number }) => leg.calculatedDurationMinutes)).toEqual([
      minutesBetween(sanFrancisco, sanDiego),
      minutesBetween(sanDiego, losAngeles),
      minutesBetween(losAngeles, sanDiego),
    ]);
    // The Leg that does not touch the Stop is left as it was.
    expect(service.asked).toHaveLength(2);
  });

  test("is not calculated again when its Stop is changed but stays where it is", async () => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, monterey);
    await legsAsRead(emil, tripId);
    service.asked.length = 0;

    await emil.updateStop(tripId, stopIds[1], { name: "Monterey Bay", place: monterey, notes: "Aquarium" });

    expect(await legsAsRead(emil, tripId)).toMatchObject([{ calculation: "calculated" }]);
    expect(service.asked).toEqual([]);
  });

  test("has no calculated travel time while one of its Stops has no place", async () => {
    const { tripId, emil } = await unlockedTrip();
    const first = await addedStop(emil, tripId, "San Francisco", sanFrancisco);
    const second = await addedStop(emil, tripId, "Big Sur");

    expect(await legsAsRead(emil, tripId)).toEqual([
      {
        fromStopId: first,
        toStopId: second,
        travelMode: "drive",
        durationMinutes: null,
        manualDurationMinutes: null,
        calculatedDurationMinutes: null,
        distanceMeters: null,
        calculation: "without-places",
      },
    ]);
    expect(service.asked).toEqual([]);

    // Once the Stop has a place the drive is calculated.
    await emil.updateStop(tripId, second, { place: monterey });
    expect(await legsAsRead(emil, tripId)).toMatchObject([
      { calculation: "calculated", durationMinutes: minutesBetween(sanFrancisco, monterey) },
    ]);

    // And without the place again, what was calculated no longer counts.
    await emil.updateStop(tripId, second, { place: null });
    expect(await legsAsRead(emil, tripId)).toMatchObject([
      { calculation: "without-places", durationMinutes: null, distanceMeters: null },
    ]);
  });

  test("has no calculated travel time while the service cannot be reached, and gets one later", async () => {
    const { tripId, emil } = await tripThrough(sanFrancisco, monterey);
    service.down = true;

    expect(await legsAsRead(emil, tripId)).toMatchObject([
      { travelMode: "drive", calculation: "unavailable", durationMinutes: null, distanceMeters: null },
    ]);
    expect((await emil.readMap(tripId)).status).toBe(200);

    // Some time later the service answers again.
    service = routeCalculationService();
    expect(await legsAsRead(emil, tripId)).toMatchObject([
      { calculation: "calculated", durationMinutes: minutesBetween(sanFrancisco, monterey) },
    ]);
  });

  test("is not asked for again when no road joins the two Stops", async () => {
    const { tripId, emil } = await tripThrough(sanFrancisco, monterey);
    service.noRoad = true;

    const legs = await legsAsRead(emil, tripId);
    await legsAsRead(emil, tripId);

    expect(legs).toMatchObject([
      { calculation: "no-road", durationMinutes: null, calculatedDurationMinutes: null, distanceMeters: null },
    ]);
    expect(service.asked).toHaveLength(1);
  });
});

describe("a travel time entered by hand", () => {
  test("counts instead of the calculated one, which is still shown", async () => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, monterey);
    const calculated = minutesBetween(sanFrancisco, monterey);

    const leg = await changedLeg(emil, tripId, stopIds[0], stopIds[1], { manualDurationMinutes: 150 });

    expect(leg).toMatchObject({
      durationMinutes: 150,
      manualDurationMinutes: 150,
      calculatedDurationMinutes: calculated,
      calculation: "calculated",
    });
    expect(await legsAsRead(emil, tripId)).toEqual([leg]);
  });

  test("can be taken away to go back to the calculated one, which is not calculated again", async () => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, monterey);
    const calculated = minutesBetween(sanFrancisco, monterey);
    await changedLeg(emil, tripId, stopIds[0], stopIds[1], { manualDurationMinutes: 150 });

    const leg = await changedLeg(emil, tripId, stopIds[0], stopIds[1], { manualDurationMinutes: null });

    expect(leg).toMatchObject({ durationMinutes: calculated, manualDurationMinutes: null });
    expect(service.asked).toHaveLength(1);
  });

  test("stays with its pair of Stops when the Route is reordered and put back", async () => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, monterey, losAngeles);
    const [first, second, third] = stopIds;
    await changedLeg(emil, tripId, first, second, { manualDurationMinutes: 150 });

    await emil.reorderStops(tripId, [first, third, second]);
    expect(await legsAsRead(emil, tripId)).toMatchObject([
      { fromStopId: first, toStopId: third, manualDurationMinutes: null },
      { fromStopId: third, toStopId: second, manualDurationMinutes: null },
    ]);

    await emil.reorderStops(tripId, stopIds);
    expect(await legsAsRead(emil, tripId)).toMatchObject([
      { fromStopId: first, toStopId: second, manualDurationMinutes: 150, durationMinutes: 150 },
      { fromStopId: second, toStopId: third, manualDurationMinutes: null },
    ]);
  });

  test("stays when one of its Stops is given another place", async () => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, monterey);
    await changedLeg(emil, tripId, stopIds[0], stopIds[1], { manualDurationMinutes: 150 });

    await emil.updateStop(tripId, stopIds[1], { place: losAngeles });

    expect(await legsAsRead(emil, tripId)).toMatchObject([
      { durationMinutes: 150, calculatedDurationMinutes: minutesBetween(sanFrancisco, losAngeles) },
    ]);
  });

  test("is all a Leg has when nothing can be calculated", async () => {
    const { tripId, emil } = await unlockedTrip();
    const first = await addedStop(emil, tripId, "San Francisco");
    const second = await addedStop(emil, tripId, "Big Sur");

    const leg = await changedLeg(emil, tripId, first, second, { manualDurationMinutes: 200 });

    expect(leg).toMatchObject({ durationMinutes: 200, calculatedDurationMinutes: null, calculation: "without-places" });
  });

  test.each([0, -5, 12.5, "90", 30 * 24 * 60 + 1])("is refused when it is %j minutes", async (minutes) => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, monterey);

    const response = await emil.updateLeg(tripId, stopIds[0], stopIds[1], { manualDurationMinutes: minutes });

    expect(response.status).toBe(400);
    expect((await response.json()).errors.manualDurationMinutes).toEqual(expect.any(String));
    expect(await legsAsRead(emil, tripId)).toMatchObject([{ manualDurationMinutes: null }]);
  });
});

describe("the travel mode of a Leg", () => {
  test.each(["flight", "train", "ferry", "other"])("can be %s, which is not calculated", async (travelMode) => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, losAngeles);

    const leg = await changedLeg(emil, tripId, stopIds[0], stopIds[1], { travelMode });

    expect(leg).toEqual({
      fromStopId: stopIds[0],
      toStopId: stopIds[1],
      travelMode,
      durationMinutes: null,
      manualDurationMinutes: null,
      calculatedDurationMinutes: null,
      distanceMeters: null,
      calculation: null,
    });
    expect(await legsAsRead(emil, tripId)).toEqual([leg]);
    expect(service.asked).toEqual([]);
  });

  test("other than Drive takes a travel time entered by hand", async () => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, losAngeles);

    const leg = await changedLeg(emil, tripId, stopIds[0], stopIds[1], { travelMode: "flight", manualDurationMinutes: 85 });

    expect(leg).toMatchObject({ travelMode: "flight", durationMinutes: 85, manualDurationMinutes: 85 });
  });

  test("hides what was calculated for the drive, and brings it back with Drive", async () => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, losAngeles);
    await legsAsRead(emil, tripId);

    const flown = await changedLeg(emil, tripId, stopIds[0], stopIds[1], { travelMode: "flight" });
    const driven = await changedLeg(emil, tripId, stopIds[0], stopIds[1], { travelMode: "drive" });

    expect(flown).toMatchObject({ durationMinutes: null, calculatedDurationMinutes: null, distanceMeters: null });
    expect(driven).toMatchObject({ durationMinutes: minutesBetween(sanFrancisco, losAngeles), calculation: "calculated" });
    expect(service.asked).toHaveLength(1);
  });

  test("is changed on its own, leaving the travel time entered by hand", async () => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, losAngeles);
    await changedLeg(emil, tripId, stopIds[0], stopIds[1], { manualDurationMinutes: 85 });

    const leg = await changedLeg(emil, tripId, stopIds[0], stopIds[1], { travelMode: "train" });

    expect(leg).toMatchObject({ travelMode: "train", manualDurationMinutes: 85 });
  });

  test.each(["bicycle", "", null, 3])("is refused when it is %j", async (travelMode) => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, losAngeles);

    const response = await emil.updateLeg(tripId, stopIds[0], stopIds[1], { travelMode });

    expect(response.status).toBe(400);
    expect((await response.json()).errors.travelMode).toEqual(expect.any(String));
    expect(await legsAsRead(emil, tripId)).toMatchObject([{ travelMode: "drive" }]);
  });
});

describe("a Leg that is not on the Route", () => {
  test("cannot be changed: two Stops that are not next to each other", async () => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, monterey, losAngeles);
    const [first, second, third] = stopIds;

    for (const [from, to] of [[first, third], [second, first], [first, first], [first, "nowhere"], ["nowhere", second]]) {
      const response = await emil.updateLeg(tripId, from, to, { manualDurationMinutes: 60 });
      expect(response.status).toBe(404);
      expect((await response.json()).error).toEqual(expect.any(String));
    }
    expect(await legsAsRead(emil, tripId)).toMatchObject([{ manualDurationMinutes: null }, { manualDurationMinutes: null }]);
  });

  test("cannot be changed: the Stops of another Trip", async () => {
    const mine = await tripThrough(sanFrancisco, monterey);
    const theirs = await tripThrough(losAngeles, sanDiego);

    const response = await mine.emil.updateLeg(mine.tripId, theirs.stopIds[0], theirs.stopIds[1], { travelMode: "flight" });

    expect(response.status).toBe(404);
    expect(await legsAsRead(theirs.emil, theirs.tripId)).toMatchObject([{ travelMode: "drive" }]);
  });
});

describe("the total travel time of a Trip", () => {
  test("sums the travel time that counts for each Leg", async () => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, monterey, losAngeles, sanDiego);
    const [first, second, third] = stopIds;
    await changedLeg(emil, tripId, first, second, { manualDurationMinutes: 150 });
    await changedLeg(emil, tripId, second, third, { travelMode: "flight", manualDurationMinutes: 70 });

    const travel = await travelAsRead(emil, tripId);

    expect(travel.totalTravelMinutes).toBe(150 + 70 + minutesBetween(losAngeles, sanDiego));
    expect(travel.legsWithoutTravelTime).toBe(0);
  });

  test("counts the Legs it has no travel time for", async () => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, monterey, losAngeles);
    await changedLeg(emil, tripId, stopIds[1], stopIds[2], { travelMode: "ferry" });

    const travel = await travelAsRead(emil, tripId);

    expect(travel.totalTravelMinutes).toBe(minutesBetween(sanFrancisco, monterey));
    expect(travel.legsWithoutTravelTime).toBe(1);
  });
});

describe("the Legs on the overview map", () => {
  async function linesAsRead(traveller: Traveller, tripId: string) {
    return (await (await traveller.readMap(tripId)).json()).route.lines;
  }

  const straight = (from: Place, to: Place) => ({
    points: [
      [from.latitude, from.longitude],
      [to.latitude, to.longitude],
    ],
    alongRoad: false,
  });

  test("follow the road for a Drive and are a straight line for every other travel mode", async () => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, monterey, losAngeles);
    await changedLeg(emil, tripId, stopIds[1], stopIds[2], { travelMode: "flight" });

    expect(await linesAsRead(emil, tripId)).toEqual([
      { points: driveBetween(sanFrancisco, monterey).road, alongRoad: true },
      straight(monterey, losAngeles),
    ]);
  });

  test("follow the road of a Drive whose travel time was entered by hand", async () => {
    const { tripId, emil, stopIds } = await tripThrough(sanFrancisco, monterey);
    await changedLeg(emil, tripId, stopIds[0], stopIds[1], { manualDurationMinutes: 150 });

    expect(await linesAsRead(emil, tripId)).toEqual([{ points: driveBetween(sanFrancisco, monterey).road, alongRoad: true }]);
  });

  test("are a straight line for a Drive that could not be calculated", async () => {
    const { tripId, emil } = await tripThrough(sanFrancisco, monterey);
    service.down = true;

    expect(await linesAsRead(emil, tripId)).toEqual([straight(sanFrancisco, monterey)]);
  });
});

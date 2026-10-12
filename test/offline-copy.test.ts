import { beforeEach, describe, expect, test } from "vitest";
import { browser, emptyDatabase, exchangeRateService, routeCalculationService, unlockedTrip } from "./support";

beforeEach(emptyDatabase);
beforeEach(() => {
  exchangeRateService({ EUR: 1, SEK: 10, USD: 1.25 });
  routeCalculationService();
});

type Traveller = ReturnType<typeof browser>;

async function added(response: Promise<Response>, name: "stop" | "item") {
  return (await (await response).json())[name] as { id: string } & Record<string, unknown>;
}

async function copyAsRead(traveller: Traveller, tripId: string) {
  const response = await traveller.readOfflineCopy(tripId);
  expect(response.status).toBe(200);
  return (await response.json()).copy;
}

const montereyBay = { label: "Monterey, California", latitude: 36.6, longitude: -121.89 };
const bigSur = { label: "Big Sur, California", latitude: 36.27, longitude: -121.81 };

describe("the offline copy of a Trip", () => {
  test("holds the Trip, its Stops in Route order and its Items, with all there is to read about them", async () => {
    const { tripId, emil } = await unlockedTrip({ travellerCount: 2 });
    const monterey = await added(
      emil.addStop(tripId, {
        name: "Monterey",
        arrivalDate: "2027-07-02",
        departureDate: "2027-07-04",
        notes: "Park behind the inn",
        place: montereyBay,
      }),
      "stop",
    );
    const south = await added(emil.addStop(tripId, { name: "Big Sur", place: bigSur }), "stop");
    const inn = await added(
      emil.addItem(tripId, {
        category: "accommodation",
        title: "Monterey Bay Inn",
        stopId: monterey.id,
        date: "2027-07-02",
        endDate: "2027-07-04",
        cost: 300,
        currency: "USD",
        place: { label: "242 Cannery Row, Monterey", latitude: 36.61, longitude: -121.9 },
        link: "https://example.com/inn",
        bookingReference: "MBI-4711",
        notes: "Late check-in arranged",
      }),
      "item",
    );
    const { item: booked } = await (await emil.updateItem(tripId, inn.id, { status: "booked" })).json();
    const flight = await added(emil.addItem(tripId, { category: "flight", title: "Flight out", cost: 4000 }), "item");

    const copy = await copyAsRead(emil, tripId);

    expect(copy.trip).toMatchObject({ id: tripId, name: "California road trip", travellerCount: 2, displayCurrency: "SEK" });
    expect(copy.stops).toEqual([(await (await emil.readStop(tripId, monterey.id)).json()).stop, south]);
    expect(copy.items).toEqual([booked, flight]);
    expect(copy.items[0]).toMatchObject({
      place: { label: "242 Cannery Row, Monterey" },
      link: "https://example.com/inn",
      bookingReference: "MBI-4711",
      notes: "Late check-in arranged",
    });
    // What is worked out on the server is in the copy, as nothing works it out offline.
    expect(copy.budget).toEqual((await (await emil.readBudget(tripId)).json()).budget);
    expect(copy.budget.total).toBe(2400);
    expect(copy.legs).toEqual((await (await emil.readLegs(tripId)).json()).travel.legs);
    expect(copy.legs).toMatchObject([{ fromStopId: monterey.id, toStopId: south.id, calculation: "calculated" }]);
    expect(copy.displayCosts).toEqual({ [inn.id]: 2400 });
  });

  test("leaves out what is deleted", async () => {
    const { tripId, emil } = await unlockedTrip();
    const monterey = await added(emil.addStop(tripId, { name: "Monterey" }), "stop");
    await emil.addItem(tripId, { category: "activity", title: "Aquarium", stopId: monterey.id });
    const flight = await added(emil.addItem(tripId, { category: "flight", title: "Flight out" }), "item");
    await emil.deleteStop(tripId, monterey.id);
    await emil.deleteItem(tripId, flight.id);

    expect(await copyAsRead(emil, tripId)).toMatchObject({ stops: [], items: [], legs: [] });
  });

  test("is not read without the Trip password, nor of a Trip that does not exist", async () => {
    const { tripId, emil } = await unlockedTrip();

    expect((await browser().readOfflineCopy(tripId)).status).toBe(401);
    expect((await emil.readOfflineCopy(crypto.randomUUID())).status).toBe(404);
  });
});

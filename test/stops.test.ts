import { beforeEach, describe, expect, test } from "vitest";
import { browser, emptyDatabase, unlockedTrip } from "./support";

beforeEach(emptyDatabase);

type Traveller = ReturnType<typeof browser>;

// Adds a Stop through the server API and returns it as the server gave it.
async function addedStop(traveller: Traveller, tripId: string, stop: Record<string, unknown>) {
  const response = await traveller.addStop(tripId, stop);
  return (await response.json()).stop as { id: string } & Record<string, unknown>;
}

async function stopsAsListed(traveller: Traveller, tripId: string) {
  const response = await traveller.listStops(tripId);
  return (await response.json()).stops as Record<string, unknown>[];
}

describe("adding a Stop", () => {
  test("takes only a name", async () => {
    const { tripId, emil } = await unlockedTrip();

    const response = await emil.addStop(tripId, { name: "San Francisco" });

    expect(response.status).toBe(201);
    const { stop } = await response.json();
    expect(stop).toEqual({
      id: expect.any(String),
      name: "San Francisco",
      arrivalDate: null,
      departureDate: null,
      nights: null,
      notes: "",
    });
    expect(await stopsAsListed(emil, tripId)).toEqual([stop]);
  });

  test("puts it last on the Route", async () => {
    const { tripId, emil } = await unlockedTrip();

    await emil.addStop(tripId, { name: "San Francisco" });
    await emil.addStop(tripId, { name: "Monterey" });
    await emil.addStop(tripId, { name: "Los Angeles" });

    expect((await stopsAsListed(emil, tripId)).map((stop) => stop.name)).toEqual([
      "San Francisco",
      "Monterey",
      "Los Angeles",
    ]);
  });

  test("with arrival and departure dates shows its number of nights", async () => {
    const { tripId, emil } = await unlockedTrip();

    const stop = await addedStop(emil, tripId, {
      name: "San Francisco",
      arrivalDate: "2027-06-28",
      departureDate: "2027-07-02",
    });

    expect(stop).toMatchObject({ arrivalDate: "2027-06-28", departureDate: "2027-07-02", nights: 4 });
    expect(await stopsAsListed(emil, tripId)).toEqual([stop]);
  });

  test("allows zero nights, for a lunch break along the way", async () => {
    const { tripId, emil } = await unlockedTrip();

    const stop = await addedStop(emil, tripId, {
      name: "Big Sur",
      arrivalDate: "2027-07-02",
      departureDate: "2027-07-02",
    });

    expect(stop.nights).toBe(0);
  });

  test("with only one of the dates has no number of nights yet", async () => {
    const { tripId, emil } = await unlockedTrip();

    const stop = await addedStop(emil, tripId, { name: "Monterey", arrivalDate: "2027-07-02" });

    expect(stop).toMatchObject({ arrivalDate: "2027-07-02", departureDate: null, nights: null });
  });

  test.each([
    ["name", { name: "   " }],
    ["name", {}],
    ["arrivalDate", { name: "Monterey", arrivalDate: "2 July" }],
    ["departureDate", { name: "Monterey", departureDate: "2027-02-30" }],
    ["departureDate", { name: "Monterey", arrivalDate: "2027-07-03", departureDate: "2027-07-02" }],
  ])("is refused with a bad %s: %j", async (field, stop) => {
    const { tripId, emil } = await unlockedTrip();

    const response = await emil.addStop(tripId, stop);

    expect(response.status).toBe(400);
    expect((await response.json()).errors[field]).toEqual(expect.any(String));
    expect(await stopsAsListed(emil, tripId)).toEqual([]);
  });

  test("is refused to a browser that has not unlocked the Trip", async () => {
    const { tripId, emil } = await unlockedTrip();

    const response = await browser().addStop(tripId, { name: "Alcatraz" });

    expect(response.status).toBe(401);
    expect(await stopsAsListed(emil, tripId)).toEqual([]);
  });
});

describe("the Stops of a Trip", () => {
  test("are shown only to a browser that has unlocked the Trip", async () => {
    const { tripId, emil } = await unlockedTrip();
    await emil.addStop(tripId, { name: "San Francisco" });

    const response = await browser().listStops(tripId);

    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty("stops");
  });

  test("belong to that Trip alone", async () => {
    const { tripId, emil } = await unlockedTrip();
    const oslo = await unlockedTrip({ name: "Weekend in Oslo" });
    await emil.addStop(tripId, { name: "San Francisco" });
    await oslo.emil.addStop(oslo.tripId, { name: "Oslo" });

    expect((await stopsAsListed(emil, tripId)).map((stop) => stop.name)).toEqual(["San Francisco"]);
  });
});

async function stopAsRead(traveller: Traveller, tripId: string, stopId: string) {
  return (await (await traveller.readStop(tripId, stopId)).json()).stop;
}

describe("opening a Stop", () => {
  test("shows that Stop", async () => {
    const { tripId, emil } = await unlockedTrip();
    await emil.addStop(tripId, { name: "San Francisco" });
    const monterey = await addedStop(emil, tripId, { name: "Monterey", arrivalDate: "2027-07-02" });

    const response = await emil.readStop(tripId, monterey.id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stop: monterey });
  });

  test("is refused to a browser that has not unlocked the Trip", async () => {
    const { tripId, emil } = await unlockedTrip();
    const stop = await addedStop(emil, tripId, { name: "San Francisco" });

    const response = await browser().readStop(tripId, stop.id);

    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty("stop");
  });

  test("does not find a Stop of another Trip", async () => {
    const { tripId, emil } = await unlockedTrip();
    const oslo = await unlockedTrip({ name: "Weekend in Oslo" });
    const stop = await addedStop(oslo.emil, oslo.tripId, { name: "Oslo" });

    expect((await emil.readStop(tripId, stop.id)).status).toBe(404);
    expect((await emil.updateStop(tripId, stop.id, { name: "Hijacked" })).status).toBe(404);
    expect((await emil.deleteStop(tripId, stop.id)).status).toBe(404);
    expect(await stopAsRead(oslo.emil, oslo.tripId, stop.id)).toEqual(stop);
  });

  test.each(["not-a-stop", "0b0f7c7e-6a55-4c0e-9d0f-2f5a5f3f8a11"])("does not find the Stop %s", async (stopId) => {
    const { tripId, emil } = await unlockedTrip();

    const response = await emil.readStop(tripId, stopId);

    expect(response.status).toBe(404);
    expect((await response.json()).error).toMatch(/Stop does not exist/);
  });
});

describe("editing a Stop", () => {
  test("changes its name, dates and notes", async () => {
    const { tripId, emil } = await unlockedTrip();
    const stop = await addedStop(emil, tripId, { name: "Montery" });

    const response = await emil.updateStop(tripId, stop.id, {
      name: "Monterey",
      arrivalDate: "2027-07-02",
      departureDate: "2027-07-04",
      notes: "Aquarium opens at 10.\nBook the whale watching early.",
    });

    const changed = {
      id: stop.id,
      name: "Monterey",
      arrivalDate: "2027-07-02",
      departureDate: "2027-07-04",
      nights: 2,
      notes: "Aquarium opens at 10.\nBook the whale watching early.",
    };
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stop: changed });
    expect(await stopAsRead(emil, tripId, stop.id)).toEqual(changed);
    expect(await stopsAsListed(emil, tripId)).toEqual([changed]);
  });

  test("leaves alone what was not sent", async () => {
    const { tripId, emil } = await unlockedTrip();
    const stop = await addedStop(emil, tripId, {
      name: "Monterey",
      arrivalDate: "2027-07-02",
      departureDate: "2027-07-04",
    });

    await emil.updateStop(tripId, stop.id, { notes: "Aquarium" });
    await emil.updateStop(tripId, stop.id, { departureDate: "2027-07-05" });

    expect(await stopAsRead(emil, tripId, stop.id)).toEqual({
      ...stop,
      departureDate: "2027-07-05",
      nights: 3,
      notes: "Aquarium",
    });
  });

  test("can take a date away again", async () => {
    const { tripId, emil } = await unlockedTrip();
    const stop = await addedStop(emil, tripId, {
      name: "Monterey",
      arrivalDate: "2027-07-02",
      departureDate: "2027-07-04",
    });

    await emil.updateStop(tripId, stop.id, { departureDate: null });

    expect(await stopAsRead(emil, tripId, stop.id)).toMatchObject({
      arrivalDate: "2027-07-02",
      departureDate: null,
      nights: null,
    });
  });

  test("does not move it on the Route", async () => {
    const { tripId, emil } = await unlockedTrip();
    const first = await addedStop(emil, tripId, { name: "San Fransisco" });
    await emil.addStop(tripId, { name: "Monterey" });

    await emil.updateStop(tripId, first.id, { name: "San Francisco" });

    expect((await stopsAsListed(emil, tripId)).map((stop) => stop.name)).toEqual(["San Francisco", "Monterey"]);
  });

  test.each([
    ["name", { name: "  " }],
    ["arrivalDate", { arrivalDate: "soon" }],
    ["notes", { notes: 42 }],
    // Against the dates the Stop already has.
    ["departureDate", { departureDate: "2027-07-01" }],
    ["departureDate", { arrivalDate: "2027-07-05" }],
  ])("is refused with a bad %s: %j", async (field, changes) => {
    const { tripId, emil } = await unlockedTrip();
    const stop = await addedStop(emil, tripId, {
      name: "Monterey",
      arrivalDate: "2027-07-02",
      departureDate: "2027-07-04",
    });

    const response = await emil.updateStop(tripId, stop.id, { notes: "Changed", ...changes });

    expect(response.status).toBe(400);
    expect((await response.json()).errors[field]).toEqual(expect.any(String));
    expect(await stopAsRead(emil, tripId, stop.id)).toEqual(stop);
  });

  test("is refused to a browser that has not unlocked the Trip", async () => {
    const { tripId, emil } = await unlockedTrip();
    const stop = await addedStop(emil, tripId, { name: "Monterey" });

    const response = await browser().updateStop(tripId, stop.id, { name: "Hijacked" });

    expect(response.status).toBe(401);
    expect(await stopAsRead(emil, tripId, stop.id)).toEqual(stop);
  });
});

// A Trip with three Stops, in Route order.
async function tripWithRoute() {
  const { tripId, emil } = await unlockedTrip();
  const sanFrancisco = await addedStop(emil, tripId, { name: "San Francisco" });
  const monterey = await addedStop(emil, tripId, { name: "Monterey" });
  const losAngeles = await addedStop(emil, tripId, { name: "Los Angeles" });
  return { tripId, emil, sanFrancisco, monterey, losAngeles };
}

async function routeAsListed(traveller: Traveller, tripId: string) {
  return (await stopsAsListed(traveller, tripId)).map((stop) => stop.name);
}

describe("reordering Stops", () => {
  test("puts the whole Route in the order given", async () => {
    const { tripId, emil, sanFrancisco, monterey, losAngeles } = await tripWithRoute();

    const response = await emil.reorderStops(tripId, [losAngeles.id, sanFrancisco.id, monterey.id]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stops: [losAngeles, sanFrancisco, monterey] });
    expect(await routeAsListed(emil, tripId)).toEqual(["Los Angeles", "San Francisco", "Monterey"]);
  });

  test("can be done again and again", async () => {
    const { tripId, emil, sanFrancisco, monterey, losAngeles } = await tripWithRoute();

    await emil.reorderStops(tripId, [losAngeles.id, sanFrancisco.id, monterey.id]);
    await emil.reorderStops(tripId, [monterey.id, losAngeles.id, sanFrancisco.id]);

    expect(await routeAsListed(emil, tripId)).toEqual(["Monterey", "Los Angeles", "San Francisco"]);
  });

  test("is followed by a Stop added afterwards, which goes last", async () => {
    const { tripId, emil, sanFrancisco, monterey, losAngeles } = await tripWithRoute();

    await emil.reorderStops(tripId, [losAngeles.id, monterey.id, sanFrancisco.id]);
    await emil.addStop(tripId, { name: "San Diego" });

    expect(await routeAsListed(emil, tripId)).toEqual(["Los Angeles", "Monterey", "San Francisco", "San Diego"]);
  });

  test("of two travellers at once leaves the order one of them asked for", async () => {
    const { tripId, emil, sanFrancisco, monterey, losAngeles } = await tripWithRoute();

    await Promise.all([
      emil.reorderStops(tripId, [losAngeles.id, sanFrancisco.id, monterey.id]),
      emil.reorderStops(tripId, [monterey.id, losAngeles.id, sanFrancisco.id]),
    ]);

    const route = await routeAsListed(emil, tripId);
    expect([
      ["Los Angeles", "San Francisco", "Monterey"],
      ["Monterey", "Los Angeles", "San Francisco"],
    ]).toContainEqual(route);
  });

  test("is refused when the order given is not exactly the Trip's Stops", async () => {
    const { tripId, emil, sanFrancisco, monterey, losAngeles } = await tripWithRoute();
    const oslo = await unlockedTrip({ name: "Weekend in Oslo" });
    const osloStop = await addedStop(oslo.emil, oslo.tripId, { name: "Oslo" });

    const orders = [
      [losAngeles.id, sanFrancisco.id],
      [losAngeles.id, sanFrancisco.id, monterey.id, osloStop.id],
      [losAngeles.id, sanFrancisco.id, osloStop.id],
      [losAngeles.id, sanFrancisco.id, sanFrancisco.id],
    ];
    for (const order of orders) {
      const response = await emil.reorderStops(tripId, order);
      expect(response.status).toBe(409);
      expect((await response.json()).error).toEqual(expect.any(String));
    }
    expect(await routeAsListed(emil, tripId)).toEqual(["San Francisco", "Monterey", "Los Angeles"]);
    expect(await routeAsListed(oslo.emil, oslo.tripId)).toEqual(["Oslo"]);
  });

  test.each([undefined, "Monterey", [42], ["not-a-stop"]])("is refused when the order given is %j", async (order) => {
    const { tripId, emil } = await tripWithRoute();

    const response = await emil.reorderStops(tripId, order);

    expect(response.status).toBe(400);
    expect(await routeAsListed(emil, tripId)).toEqual(["San Francisco", "Monterey", "Los Angeles"]);
  });

  test("is refused to a browser that has not unlocked the Trip", async () => {
    const { tripId, emil, sanFrancisco, monterey, losAngeles } = await tripWithRoute();

    const response = await browser().reorderStops(tripId, [losAngeles.id, sanFrancisco.id, monterey.id]);

    expect(response.status).toBe(401);
    expect(await routeAsListed(emil, tripId)).toEqual(["San Francisco", "Monterey", "Los Angeles"]);
  });
});

describe("deleting a Stop", () => {
  test("takes it off the Route", async () => {
    const { tripId, emil, monterey } = await tripWithRoute();

    const response = await emil.deleteStop(tripId, monterey.id);

    expect(response.status).toBe(204);
    expect(await routeAsListed(emil, tripId)).toEqual(["San Francisco", "Los Angeles"]);
    expect((await emil.readStop(tripId, monterey.id)).status).toBe(404);
  });

  test("leaves a Stop that can no longer be edited, reordered or deleted again", async () => {
    const { tripId, emil, sanFrancisco, monterey, losAngeles } = await tripWithRoute();
    await emil.deleteStop(tripId, monterey.id);

    expect((await emil.updateStop(tripId, monterey.id, { name: "Carmel" })).status).toBe(404);
    expect((await emil.deleteStop(tripId, monterey.id)).status).toBe(404);
    expect((await emil.reorderStops(tripId, [monterey.id, losAngeles.id, sanFrancisco.id])).status).toBe(409);
    expect((await emil.reorderStops(tripId, [losAngeles.id, sanFrancisco.id])).status).toBe(200);
    expect(await routeAsListed(emil, tripId)).toEqual(["Los Angeles", "San Francisco"]);
  });

  test("is refused to a browser that has not unlocked the Trip", async () => {
    const { tripId, emil, monterey } = await tripWithRoute();

    const response = await browser().deleteStop(tripId, monterey.id);

    expect(response.status).toBe(401);
    expect(await routeAsListed(emil, tripId)).toEqual(["San Francisco", "Monterey", "Los Angeles"]);
  });
});

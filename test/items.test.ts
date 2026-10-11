import { beforeEach, describe, expect, test } from "vitest";
import { browser, emptyDatabase, unlockedTrip } from "./support";

beforeEach(emptyDatabase);

type Traveller = ReturnType<typeof browser>;

async function addedStop(traveller: Traveller, tripId: string, name: string) {
  const response = await traveller.addStop(tripId, { name });
  return (await response.json()).stop as { id: string };
}

// Adds an Item through the server API and returns it as the server gave it.
async function addedItem(traveller: Traveller, tripId: string, item: Record<string, unknown>) {
  const response = await traveller.addItem(tripId, item);
  return (await response.json()).item as { id: string } & Record<string, unknown>;
}

async function itemsAsListed(traveller: Traveller, tripId: string) {
  const response = await traveller.listItems(tripId);
  return (await response.json()).items as Record<string, unknown>[];
}

async function itemAsRead(traveller: Traveller, tripId: string, itemId: string) {
  return (await (await traveller.readItem(tripId, itemId)).json()).item;
}

// A Trip with two Stops.
async function tripWithStops() {
  const { tripId, emil } = await unlockedTrip();
  const monterey = await addedStop(emil, tripId, "Monterey");
  const losAngeles = await addedStop(emil, tripId, "Los Angeles");
  return { tripId, emil, monterey, losAngeles };
}

const inn = {
  category: "accommodation",
  title: "Monterey Bay Inn",
  date: "2027-07-02",
  endDate: "2027-07-04",
};

describe("adding an Item", () => {
  test("to the Trip level takes only a Category and a title", async () => {
    const { tripId, emil } = await unlockedTrip({ displayCurrency: "SEK" });

    const response = await emil.addItem(tripId, { category: "flight", title: "Stockholm to San Francisco" });

    expect(response.status).toBe(201);
    const { item } = await response.json();
    expect(item).toEqual({
      id: expect.any(String),
      stopId: null,
      category: "flight",
      title: "Stockholm to San Francisco",
      status: "suggestion",
      cost: null,
      // Until told otherwise an Item is priced in the Trip's display currency.
      currency: "SEK",
      costBasis: "total",
      date: null,
      endDate: null,
      link: "",
      bookingReference: "",
      notes: "",
    });
    expect(await itemsAsListed(emil, tripId)).toEqual([item]);
  });

  test("to a Stop puts it under that Stop", async () => {
    const { tripId, emil, monterey } = await tripWithStops();

    const item = await addedItem(emil, tripId, { category: "activity", title: "Aquarium", stopId: monterey.id });

    expect(item.stopId).toBe(monterey.id);
    expect(await itemsAsListed(emil, tripId)).toEqual([item]);
  });

  test("keeps its cost, currency, cost basis, link, booking reference and notes", async () => {
    const { tripId, emil } = await unlockedTrip();
    const details = {
      category: "car_rental",
      title: "Convertible from SFO",
      cost: 512.5,
      currency: "USD",
      costBasis: "per_person",
      link: "https://rentals.example/booking/42",
      bookingReference: "ZX81-Q",
      notes: "Pick up at the airport.\nReturn with a full tank.",
    };

    const item = await addedItem(emil, tripId, details);

    expect(item).toMatchObject(details);
    expect(await itemAsRead(emil, tripId, item.id)).toEqual(item);
  });

  test.each(["flight", "car_rental", "accommodation", "activity", "food", "transport", "other"])(
    "takes the Category %s",
    async (category) => {
      const { tripId, emil } = await unlockedTrip();

      const item = await addedItem(emil, tripId, { ...inn, category });

      expect(item.category).toBe(category);
    },
  );

  test("lists Items in the order they were added", async () => {
    const { tripId, emil, monterey } = await tripWithStops();

    await emil.addItem(tripId, { category: "flight", title: "Flight out" });
    await emil.addItem(tripId, { category: "activity", title: "Aquarium", stopId: monterey.id });
    await emil.addItem(tripId, { category: "flight", title: "Flight home" });

    expect((await itemsAsListed(emil, tripId)).map((item) => item.title)).toEqual([
      "Flight out",
      "Aquarium",
      "Flight home",
    ]);
  });

  test("puts https:// in front of a link given without it", async () => {
    const { tripId, emil } = await unlockedTrip();

    const item = await addedItem(emil, tripId, { category: "food", title: "Tacos", link: " tacos.example/menu " });

    expect(item.link).toBe("https://tacos.example/menu");
  });

  test("keeps a link that carries another address inside it", async () => {
    const { tripId, emil } = await unlockedTrip();
    const link = "http://tickets.example/go?to=https://aquarium.example/buy";

    const item = await addedItem(emil, tripId, { category: "activity", title: "Aquarium", link });

    expect(item.link).toBe(link);
  });

  test.each([
    ["category", { title: "Aquarium" }],
    ["category", { category: "camping", title: "Monterey Bay Inn" }],
    ["title", { category: "activity", title: "  " }],
    ["title", { category: "activity" }],
    ["cost", { category: "activity", title: "Aquarium", cost: -1 }],
    ["cost", { category: "activity", title: "Aquarium", cost: 49.999 }],
    ["cost", { category: "activity", title: "Aquarium", cost: "50" }],
    ["currency", { category: "activity", title: "Aquarium", currency: "DOLLARS" }],
    ["costBasis", { category: "activity", title: "Aquarium", costBasis: "each" }],
    ["link", { category: "activity", title: "Aquarium", link: "javascript:alert(1)" }],
    ["link", { category: "activity", title: "Aquarium", link: "ftp://aquarium.example" }],
    ["link", { category: "activity", title: "Aquarium", link: "ask at the desk" }],
    ["link", { category: "activity", title: "Aquarium", link: "mailto:desk@aquarium.example" }],
    ["date", { category: "activity", title: "Aquarium", date: "2 July" }],
    ["endDate", { category: "activity", title: "Aquarium", date: "2027-07-04", endDate: "2027-07-02" }],
    ["notes", { category: "activity", title: "Aquarium", notes: 42 }],
    ["stopId", { category: "activity", title: "Aquarium", stopId: "not-a-stop" }],
    ["stopId", { category: "activity", title: "Aquarium", stopId: "0b0f7c7e-6a55-4c0e-9d0f-2f5a5f3f8a11" }],
  ])("is refused with a bad %s: %j", async (field, item) => {
    const { tripId, emil } = await unlockedTrip();

    const response = await emil.addItem(tripId, item);

    expect(response.status).toBe(400);
    expect((await response.json()).errors[field]).toEqual(expect.any(String));
    expect(await itemsAsListed(emil, tripId)).toEqual([]);
  });

  test("is refused to a Stop of another Trip", async () => {
    const { tripId, emil } = await unlockedTrip();
    const oslo = await unlockedTrip({ name: "Weekend in Oslo" });
    const osloStop = await addedStop(oslo.emil, oslo.tripId, "Oslo");

    const response = await emil.addItem(tripId, { category: "food", title: "Waffles", stopId: osloStop.id });

    expect(response.status).toBe(400);
    expect((await response.json()).errors.stopId).toEqual(expect.any(String));
    expect(await itemsAsListed(oslo.emil, oslo.tripId)).toEqual([]);
  });

  test("is refused to a deleted Stop", async () => {
    const { tripId, emil, monterey } = await tripWithStops();
    await emil.deleteStop(tripId, monterey.id);

    const response = await emil.addItem(tripId, { category: "activity", title: "Aquarium", stopId: monterey.id });

    expect(response.status).toBe(400);
  });

  test("is refused to a browser that has not unlocked the Trip", async () => {
    const { tripId, emil } = await unlockedTrip();

    const response = await browser().addItem(tripId, { category: "activity", title: "Aquarium" });

    expect(response.status).toBe(401);
    expect(await itemsAsListed(emil, tripId)).toEqual([]);
  });
});

describe("an Accommodation", () => {
  test("is added with check-in and check-out dates", async () => {
    const { tripId, emil, monterey } = await tripWithStops();

    const item = await addedItem(emil, tripId, { ...inn, stopId: monterey.id });

    expect(item).toMatchObject({ category: "accommodation", date: "2027-07-02", endDate: "2027-07-04" });
  });

  test.each([
    ["date", { endDate: "2027-07-04" }],
    ["endDate", { date: "2027-07-02" }],
    ["date", {}],
    ["date", { date: null, endDate: "2027-07-04" }],
  ])("is refused without its %s: %j", async (field, dates) => {
    const { tripId, emil } = await unlockedTrip();

    const response = await emil.addItem(tripId, { category: "accommodation", title: "Monterey Bay Inn", ...dates });

    expect(response.status).toBe(400);
    expect((await response.json()).errors[field]).toEqual(expect.any(String));
    expect(await itemsAsListed(emil, tripId)).toEqual([]);
  });

  test("cannot have a date taken away", async () => {
    const { tripId, emil } = await unlockedTrip();
    const item = await addedItem(emil, tripId, inn);

    const response = await emil.updateItem(tripId, item.id, { endDate: null });

    expect(response.status).toBe(400);
    expect((await response.json()).errors.endDate).toEqual(expect.any(String));
    expect(await itemAsRead(emil, tripId, item.id)).toEqual(item);
  });

  test("is what another Item can only become once it has both dates", async () => {
    const { tripId, emil } = await unlockedTrip();
    const item = await addedItem(emil, tripId, { category: "other", title: "Monterey Bay Inn" });

    const refused = await emil.updateItem(tripId, item.id, { category: "accommodation" });
    expect(refused.status).toBe(400);
    expect((await refused.json()).errors.date).toEqual(expect.any(String));
    expect(await itemAsRead(emil, tripId, item.id)).toEqual(item);

    const response = await emil.updateItem(tripId, item.id, {
      category: "accommodation",
      date: "2027-07-02",
      endDate: "2027-07-04",
    });
    expect(response.status).toBe(200);
    expect(await itemAsRead(emil, tripId, item.id)).toMatchObject(inn);
  });

  test("can become another Category and then lose its dates", async () => {
    const { tripId, emil } = await unlockedTrip();
    const item = await addedItem(emil, tripId, inn);

    const response = await emil.updateItem(tripId, item.id, { category: "other", date: null, endDate: null });

    expect(response.status).toBe(200);
    expect(await itemAsRead(emil, tripId, item.id)).toMatchObject({ category: "other", date: null, endDate: null });
  });
});

describe("an Item of another Category", () => {
  test.each(["flight", "car_rental", "activity", "food", "transport", "other"])(
    "needs no dates: %s",
    async (category) => {
      const { tripId, emil } = await unlockedTrip();

      const response = await emil.addItem(tripId, { category, title: "No dates yet" });

      expect(response.status).toBe(201);
    },
  );
});

describe("the Items of a Trip", () => {
  test("are shown only to a browser that has unlocked the Trip", async () => {
    const { tripId, emil } = await unlockedTrip();
    const item = await addedItem(emil, tripId, { category: "flight", title: "Flight out" });

    const listed = await browser().listItems(tripId);
    const read = await browser().readItem(tripId, item.id);

    expect(listed.status).toBe(401);
    expect(await listed.json()).not.toHaveProperty("items");
    expect(read.status).toBe(401);
    expect(await read.json()).not.toHaveProperty("item");
  });

  test("belong to that Trip alone", async () => {
    const { tripId, emil } = await unlockedTrip();
    const oslo = await unlockedTrip({ name: "Weekend in Oslo" });
    await emil.addItem(tripId, { category: "flight", title: "Flight out" });
    const waffles = await addedItem(oslo.emil, oslo.tripId, { category: "food", title: "Waffles" });

    expect((await itemsAsListed(emil, tripId)).map((item) => item.title)).toEqual(["Flight out"]);
    expect((await emil.readItem(tripId, waffles.id)).status).toBe(404);
    expect((await emil.updateItem(tripId, waffles.id, { title: "Hijacked" })).status).toBe(404);
    expect((await emil.deleteItem(tripId, waffles.id)).status).toBe(404);
    expect(await itemAsRead(oslo.emil, oslo.tripId, waffles.id)).toEqual(waffles);
  });

  test.each(["not-an-item", "0b0f7c7e-6a55-4c0e-9d0f-2f5a5f3f8a11"])("do not include the Item %s", async (itemId) => {
    const { tripId, emil } = await unlockedTrip();

    const response = await emil.readItem(tripId, itemId);

    expect(response.status).toBe(404);
    expect((await response.json()).error).toMatch(/Item does not exist/);
  });
});

describe("editing an Item", () => {
  test("changes any of its fields", async () => {
    const { tripId, emil } = await unlockedTrip();
    const item = await addedItem(emil, tripId, { category: "other", title: "Somewhere to sleep" });
    const changes = {
      category: "accommodation",
      title: "Monterey Bay Inn",
      cost: 3200,
      currency: "USD",
      costBasis: "per_person",
      date: "2027-07-02",
      endDate: "2027-07-04",
      link: "https://inn.example/rooms",
      bookingReference: "MBI-2027-881",
      notes: "Ocean view.",
    };

    const response = await emil.updateItem(tripId, item.id, changes);

    const changed = { id: item.id, stopId: null, status: "suggestion", ...changes };
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ item: changed });
    expect(await itemAsRead(emil, tripId, item.id)).toEqual(changed);
    expect(await itemsAsListed(emil, tripId)).toEqual([changed]);
  });

  test("leaves alone what was not sent", async () => {
    const { tripId, emil } = await unlockedTrip();
    const item = await addedItem(emil, tripId, { category: "activity", title: "Aquarium", cost: 50, currency: "USD" });

    await emil.updateItem(tripId, item.id, { notes: "Opens at 10." });
    await emil.updateItem(tripId, item.id, { cost: 59.95 });

    expect(await itemAsRead(emil, tripId, item.id)).toEqual({ ...item, cost: 59.95, notes: "Opens at 10." });
  });

  test("can take the cost, link and booking reference away again", async () => {
    const { tripId, emil } = await unlockedTrip();
    const item = await addedItem(emil, tripId, {
      category: "activity",
      title: "Aquarium",
      cost: 50,
      link: "https://aquarium.example",
      bookingReference: "AQ-1",
    });

    await emil.updateItem(tripId, item.id, { cost: null, link: "", bookingReference: "" });

    expect(await itemAsRead(emil, tripId, item.id)).toMatchObject({ cost: null, link: "", bookingReference: "" });
  });

  test.each([
    ["title", { title: "  " }],
    ["category", { category: "camping" }],
    ["cost", { cost: -5 }],
    ["currency", { currency: "??" }],
    ["link", { link: "javascript:alert(1)" }],
    // Against the dates the Item already has.
    ["endDate", { endDate: "2027-07-01" }],
    ["endDate", { date: "2027-07-05" }],
    ["date", { date: null }],
  ])("is refused with a bad %s: %j", async (field, changes) => {
    const { tripId, emil } = await unlockedTrip();
    const item = await addedItem(emil, tripId, inn);

    const response = await emil.updateItem(tripId, item.id, { notes: "Changed", ...changes });

    expect(response.status).toBe(400);
    expect((await response.json()).errors[field]).toEqual(expect.any(String));
    expect(await itemAsRead(emil, tripId, item.id)).toEqual(item);
  });

  test("is refused to a browser that has not unlocked the Trip", async () => {
    const { tripId, emil } = await unlockedTrip();
    const item = await addedItem(emil, tripId, { category: "activity", title: "Aquarium" });

    const response = await browser().updateItem(tripId, item.id, { title: "Hijacked" });

    expect(response.status).toBe(401);
    expect(await itemAsRead(emil, tripId, item.id)).toEqual(item);
  });
});

describe("moving an Item", () => {
  test("to another Stop keeps everything else about it", async () => {
    const { tripId, emil, monterey, losAngeles } = await tripWithStops();
    const item = await addedItem(emil, tripId, { ...inn, stopId: monterey.id, cost: 3200 });

    const response = await emil.updateItem(tripId, item.id, { stopId: losAngeles.id });

    expect(response.status).toBe(200);
    expect(await itemAsRead(emil, tripId, item.id)).toEqual({ ...item, stopId: losAngeles.id });
  });

  test("to the Trip level takes it off its Stop", async () => {
    const { tripId, emil, monterey } = await tripWithStops();
    const item = await addedItem(emil, tripId, { category: "car_rental", title: "Convertible", stopId: monterey.id });

    await emil.updateItem(tripId, item.id, { stopId: null });

    expect(await itemAsRead(emil, tripId, item.id)).toEqual({ ...item, stopId: null });
  });

  test("from the Trip level puts it under a Stop", async () => {
    const { tripId, emil, monterey } = await tripWithStops();
    const item = await addedItem(emil, tripId, { category: "activity", title: "Aquarium" });

    await emil.updateItem(tripId, item.id, { stopId: monterey.id });

    expect(await itemAsRead(emil, tripId, item.id)).toEqual({ ...item, stopId: monterey.id });
  });

  test("is refused to a Stop that is not on the Trip's Route", async () => {
    const { tripId, emil, monterey, losAngeles } = await tripWithStops();
    const oslo = await unlockedTrip({ name: "Weekend in Oslo" });
    const osloStop = await addedStop(oslo.emil, oslo.tripId, "Oslo");
    const item = await addedItem(emil, tripId, { category: "activity", title: "Aquarium", stopId: monterey.id });
    await emil.deleteStop(tripId, losAngeles.id);

    for (const stopId of [osloStop.id, losAngeles.id, "0b0f7c7e-6a55-4c0e-9d0f-2f5a5f3f8a11", "not-a-stop", 42]) {
      const response = await emil.updateItem(tripId, item.id, { stopId });
      expect(response.status).toBe(400);
      expect((await response.json()).errors.stopId).toEqual(expect.any(String));
    }
    expect(await itemAsRead(emil, tripId, item.id)).toEqual(item);
  });
});

describe("deleting an Item", () => {
  test("takes it off the Trip", async () => {
    const { tripId, emil } = await unlockedTrip();
    const flight = await addedItem(emil, tripId, { category: "flight", title: "Flight out" });
    const car = await addedItem(emil, tripId, { category: "car_rental", title: "Convertible" });

    const response = await emil.deleteItem(tripId, flight.id);

    expect(response.status).toBe(204);
    expect(await itemsAsListed(emil, tripId)).toEqual([car]);
    expect((await emil.readItem(tripId, flight.id)).status).toBe(404);
  });

  test("leaves an Item that can no longer be edited or deleted again", async () => {
    const { tripId, emil } = await unlockedTrip();
    const flight = await addedItem(emil, tripId, { category: "flight", title: "Flight out" });
    await emil.deleteItem(tripId, flight.id);

    expect((await emil.updateItem(tripId, flight.id, { title: "Flight back" })).status).toBe(404);
    expect((await emil.deleteItem(tripId, flight.id)).status).toBe(404);
  });

  test("is refused to a browser that has not unlocked the Trip", async () => {
    const { tripId, emil } = await unlockedTrip();
    const flight = await addedItem(emil, tripId, { category: "flight", title: "Flight out" });

    const response = await browser().deleteItem(tripId, flight.id);

    expect(response.status).toBe(401);
    expect(await itemsAsListed(emil, tripId)).toEqual([flight]);
  });
});

describe("deleting a Stop", () => {
  test("deletes the Items under it and no others", async () => {
    const { tripId, emil, monterey, losAngeles } = await tripWithStops();
    const aquarium = await addedItem(emil, tripId, { category: "activity", title: "Aquarium", stopId: monterey.id });
    const bayInn = await addedItem(emil, tripId, { ...inn, stopId: monterey.id });
    const flight = await addedItem(emil, tripId, { category: "flight", title: "Flight out" });
    const pier = await addedItem(emil, tripId, { category: "activity", title: "Pier", stopId: losAngeles.id });

    await emil.deleteStop(tripId, monterey.id);

    expect(await itemsAsListed(emil, tripId)).toEqual([flight, pier]);
    for (const item of [aquarium, bayInn]) {
      expect((await emil.readItem(tripId, item.id)).status).toBe(404);
      expect((await emil.updateItem(tripId, item.id, { stopId: null })).status).toBe(404);
    }
  });

  test("at the moment an Item is added to it does not leave the Item behind", async () => {
    const { tripId, emil, monterey } = await tripWithStops();

    const [added] = await Promise.all([
      emil.addItem(tripId, { category: "activity", title: "Aquarium", stopId: monterey.id }),
      emil.deleteStop(tripId, monterey.id),
    ]);

    // Either the Item was refused, or it was added in time to be deleted with the Stop.
    expect([201, 400]).toContain(added.status);
    expect(await itemsAsListed(emil, tripId)).toEqual([]);
  });
});

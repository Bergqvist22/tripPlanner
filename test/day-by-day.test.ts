import { beforeEach, describe, expect, test } from "vitest";
import { browser, emptyDatabase, unlockedTrip } from "./support";

beforeEach(emptyDatabase);

type Traveller = ReturnType<typeof browser>;
type Listed = { days: { date: string; items: { title: string }[] }[]; unscheduled: { title: string }[] };

async function addedStop(traveller: Traveller, tripId: string, name: string) {
  const response = await traveller.addStop(tripId, { name, arrivalDate: "2027-07-02", departureDate: "2027-07-04" });
  return (await response.json()).stop as { id: string };
}

async function addedItem(traveller: Traveller, tripId: string, item: Record<string, unknown>) {
  const response = await traveller.addItem(tripId, { category: "activity", ...item });
  expect(response.status).toBe(201);
  return (await response.json()).item as { id: string } & Record<string, unknown>;
}

async function itemAsRead(traveller: Traveller, tripId: string, itemId: string) {
  return (await (await traveller.readItem(tripId, itemId)).json()).item;
}

// The titles of what is listed, day by day.
function titles({ days, unscheduled }: Listed) {
  return {
    days: days.map(({ date, items }) => [date, ...items.map((item) => item.title)]),
    unscheduled: unscheduled.map((item) => item.title),
  };
}

async function stopDayByDay(traveller: Traveller, tripId: string, stopId: string) {
  const response = await traveller.readStopDays(tripId, stopId);
  expect(response.status).toBe(200);
  return titles((await response.json()).dayByDay);
}

async function tripDayByDay(traveller: Traveller, tripId: string) {
  const response = await traveller.readTripDays(tripId);
  expect(response.status).toBe(200);
  return titles((await response.json()).dayByDay);
}

// A Trip with a Stop in Monterey and one in Los Angeles.
async function tripWithStops() {
  const { tripId, emil } = await unlockedTrip();
  const stop = await addedStop(emil, tripId, "Monterey");
  const losAngeles = await addedStop(emil, tripId, "Los Angeles");
  return { tripId, emil, stop, losAngeles };
}

describe("the date and time of an Item", () => {
  test("are not needed", async () => {
    const { tripId, emil } = await unlockedTrip();

    const item = await addedItem(emil, tripId, { title: "Whale watching" });

    expect(item).toMatchObject({ date: null, time: null });
  });

  test.each(["flight", "car_rental", "accommodation", "activity", "food", "transport", "other"])(
    "can be given to a new Item of the Category %s",
    async (category) => {
      const { tripId, emil } = await unlockedTrip();

      const item = await addedItem(emil, tripId, {
        category,
        title: "Something at ten",
        date: "2027-07-02",
        endDate: "2027-07-04",
        time: "10:00",
      });

      expect(item).toMatchObject({ date: "2027-07-02", time: "10:00" });
      expect(await itemAsRead(emil, tripId, item.id)).toEqual(item);
    },
  );

  test("can be given, changed and taken away afterwards, each on its own", async () => {
    const { tripId, emil } = await unlockedTrip();
    const item = await addedItem(emil, tripId, { title: "Aquarium", notes: "Opens at 10." });

    const dated = await emil.updateItem(tripId, item.id, { date: "2027-07-03" });
    expect(dated.status).toBe(200);
    expect((await dated.json()).item).toEqual({ ...item, date: "2027-07-03" });

    await emil.updateItem(tripId, item.id, { time: "09:30" });
    expect(await itemAsRead(emil, tripId, item.id)).toEqual({ ...item, date: "2027-07-03", time: "09:30" });

    await emil.updateItem(tripId, item.id, { time: "23:59" });
    expect(await itemAsRead(emil, tripId, item.id)).toEqual({ ...item, date: "2027-07-03", time: "23:59" });

    await emil.updateItem(tripId, item.id, { time: null });
    expect(await itemAsRead(emil, tripId, item.id)).toEqual({ ...item, date: "2027-07-03" });

    await emil.updateItem(tripId, item.id, { date: null });
    expect(await itemAsRead(emil, tripId, item.id)).toEqual(item);
  });

  test.each(["ten", "10", "24:00", "10:60", "1:00", "10:00:00", "", 1000])("a time cannot be %j", async (time) => {
    const { tripId, emil } = await unlockedTrip();
    const item = await addedItem(emil, tripId, { title: "Aquarium", date: "2027-07-03", time: "09:30" });

    const added = await emil.addItem(tripId, { category: "food", title: "Chowder", time });
    const changed = await emil.updateItem(tripId, item.id, { time });

    for (const response of [added, changed]) {
      expect(response.status).toBe(400);
      expect((await response.json()).errors.time).toEqual(expect.any(String));
    }
    expect(await itemAsRead(emil, tripId, item.id)).toEqual(item);
  });
});

describe("the Items of a Stop, day by day", () => {
  test("are listed under their day, the days in order", async () => {
    const { tripId, emil, stop } = await tripWithStops();
    await addedItem(emil, tripId, { stopId: stop.id, title: "Farewell breakfast", date: "2027-07-04" });
    await addedItem(emil, tripId, { stopId: stop.id, title: "Aquarium", date: "2027-07-02" });
    await addedItem(emil, tripId, { stopId: stop.id, title: "Whale watching", date: "2027-07-03" });

    expect(await stopDayByDay(emil, tripId, stop.id)).toEqual({
      days: [
        ["2027-07-02", "Aquarium"],
        ["2027-07-03", "Whale watching"],
        ["2027-07-04", "Farewell breakfast"],
      ],
      unscheduled: [],
    });
  });

  test("are in time order within a day, those without a time first", async () => {
    const { tripId, emil, stop } = await tripWithStops();
    const on = { stopId: stop.id, date: "2027-07-03" };
    await addedItem(emil, tripId, { ...on, title: "Dinner", time: "19:00" });
    await addedItem(emil, tripId, { ...on, title: "Stroll along the coast" });
    await addedItem(emil, tripId, { ...on, title: "Whale watching", time: "09:30" });
    await addedItem(emil, tripId, { ...on, title: "Lunch", time: "12:00" });
    await addedItem(emil, tripId, { ...on, title: "Buy sunscreen" });
    await addedItem(emil, tripId, { ...on, title: "Coffee", time: "09:30" });

    const { days } = await stopDayByDay(emil, tripId, stop.id);

    // Without a time, and at the same time, in the order they were added.
    expect(days).toEqual([
      ["2027-07-03", "Stroll along the coast", "Buy sunscreen", "Whale watching", "Coffee", "Lunch", "Dinner"],
    ]);
  });

  test("are Unscheduled without a date, in the order they were added", async () => {
    const { tripId, emil, stop } = await tripWithStops();
    await addedItem(emil, tripId, { stopId: stop.id, title: "Kayaking" });
    await addedItem(emil, tripId, { stopId: stop.id, title: "Aquarium", date: "2027-07-02" });
    await addedItem(emil, tripId, { stopId: stop.id, title: "Chowder", category: "food" });
    // A time alone does not say which day.
    await addedItem(emil, tripId, { stopId: stop.id, title: "Sunset", time: "20:15" });

    expect(await stopDayByDay(emil, tripId, stop.id)).toEqual({
      days: [["2027-07-02", "Aquarium"]],
      unscheduled: ["Kayaking", "Chowder", "Sunset"],
    });
  });

  test("have an Accommodation on its check-in day only", async () => {
    const { tripId, emil, stop } = await tripWithStops();
    await addedItem(emil, tripId, {
      stopId: stop.id,
      category: "accommodation",
      title: "Monterey Bay Inn",
      date: "2027-07-02",
      endDate: "2027-07-04",
      time: "15:00",
    });
    await addedItem(emil, tripId, { stopId: stop.id, title: "Aquarium", date: "2027-07-02", time: "10:00" });
    await addedItem(emil, tripId, { stopId: stop.id, title: "Whale watching", date: "2027-07-03" });

    expect(await stopDayByDay(emil, tripId, stop.id)).toEqual({
      days: [
        ["2027-07-02", "Aquarium", "Monterey Bay Inn"],
        ["2027-07-03", "Whale watching"],
      ],
      unscheduled: [],
    });
  });

  test("give each Item as it is read elsewhere", async () => {
    const { tripId, emil, stop } = await tripWithStops();
    const visit = await addedItem(emil, tripId, { stopId: stop.id, title: "Aquarium", date: "2027-07-02", time: "10:00" });
    const idea = await addedItem(emil, tripId, { stopId: stop.id, title: "Kayaking" });
    await emil.updateItem(tripId, idea.id, { status: "rejected" });

    const response = await emil.readStopDays(tripId, stop.id);

    expect(await response.json()).toEqual({
      dayByDay: {
        days: [{ date: "2027-07-02", items: [visit] }],
        // Rejected Items too, for the page to leave out until they are shown.
        unscheduled: [{ ...idea, status: "rejected" }],
      },
    });
  });

  test("follow an Item that is given another day, moved or deleted", async () => {
    const { tripId, emil, stop, losAngeles } = await tripWithStops();
    const visit = await addedItem(emil, tripId, { stopId: stop.id, title: "Aquarium", date: "2027-07-02" });
    const dinner = await addedItem(emil, tripId, { stopId: stop.id, title: "Dinner", date: "2027-07-02", time: "19:00" });

    await emil.updateItem(tripId, visit.id, { date: "2027-07-03" });
    expect((await stopDayByDay(emil, tripId, stop.id)).days).toEqual([
      ["2027-07-02", "Dinner"],
      ["2027-07-03", "Aquarium"],
    ]);

    await emil.updateItem(tripId, dinner.id, { stopId: losAngeles.id });
    await emil.updateItem(tripId, visit.id, { date: null });
    expect(await stopDayByDay(emil, tripId, stop.id)).toEqual({ days: [], unscheduled: ["Aquarium"] });
    expect((await stopDayByDay(emil, tripId, losAngeles.id)).days).toEqual([["2027-07-02", "Dinner"]]);

    await emil.deleteItem(tripId, visit.id);
    expect(await stopDayByDay(emil, tripId, stop.id)).toEqual({ days: [], unscheduled: [] });
  });

  test("are not read for a Stop that is deleted, unknown or of another Trip", async () => {
    const { tripId, emil, stop, losAngeles } = await tripWithStops();
    const oslo = await unlockedTrip({ name: "Oslo weekend" });
    await emil.deleteStop(tripId, losAngeles.id);

    for (const response of [
      await emil.readStopDays(tripId, losAngeles.id),
      await emil.readStopDays(tripId, "4b1c6c2e-0d0f-4a55-9d3a-0f6e3f1f6f11"),
      await emil.readStopDays(tripId, "not-a-stop"),
      await oslo.emil.readStopDays(oslo.tripId, stop.id),
    ]) {
      expect(response.status).toBe(404);
    }
  });
});

describe("the Items for the whole Trip, day by day", () => {
  test("are listed by day and time, and Unscheduled without a date", async () => {
    const { tripId, emil } = await tripWithStops();
    await addedItem(emil, tripId, { category: "flight", title: "Flight home", date: "2027-07-12", time: "17:40" });
    await addedItem(emil, tripId, { category: "car_rental", title: "Pick up the car", date: "2027-07-01", time: "14:00" });
    await addedItem(emil, tripId, { category: "other", title: "Travel insurance" });
    await addedItem(emil, tripId, { category: "flight", title: "Flight out", date: "2027-07-01", time: "06:15" });
    await addedItem(emil, tripId, { category: "other", title: "Pack", date: "2027-07-01" });

    expect(await tripDayByDay(emil, tripId)).toEqual({
      days: [
        ["2027-07-01", "Pack", "Flight out", "Pick up the car"],
        ["2027-07-12", "Flight home"],
      ],
      unscheduled: ["Travel insurance"],
    });
  });

  test("leave out the Items of the Stops, as each Stop leaves out the others'", async () => {
    const { tripId, emil, stop, losAngeles } = await tripWithStops();
    await addedItem(emil, tripId, { category: "flight", title: "Flight out", date: "2027-07-01" });
    await addedItem(emil, tripId, { stopId: stop.id, title: "Aquarium", date: "2027-07-02" });
    await addedItem(emil, tripId, { stopId: losAngeles.id, title: "Griffith Observatory" });

    expect(await tripDayByDay(emil, tripId)).toEqual({ days: [["2027-07-01", "Flight out"]], unscheduled: [] });
    expect(await stopDayByDay(emil, tripId, stop.id)).toEqual({ days: [["2027-07-02", "Aquarium"]], unscheduled: [] });
    expect(await stopDayByDay(emil, tripId, losAngeles.id)).toEqual({ days: [], unscheduled: ["Griffith Observatory"] });
  });
});

test("nothing is listed day by day for a browser that has not unlocked the Trip", async () => {
  const { tripId, emil, stop } = await tripWithStops();
  await addedItem(emil, tripId, { stopId: stop.id, title: "Aquarium", date: "2027-07-02" });

  for (const response of [await browser().readTripDays(tripId), await browser().readStopDays(tripId, stop.id)]) {
    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty("dayByDay");
  }
});

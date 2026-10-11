import { beforeEach, describe, expect, test } from "vitest";
import { browser, emptyDatabase, unlockedTrip } from "./support";

beforeEach(emptyDatabase);

type Traveller = ReturnType<typeof browser>;

async function addedItem(traveller: Traveller, tripId: string, item: Record<string, unknown>) {
  const response = await traveller.addItem(tripId, item);
  return (await response.json()).item as { id: string } & Record<string, unknown>;
}

async function itemAsRead(traveller: Traveller, tripId: string, itemId: string) {
  return (await (await traveller.readItem(tripId, itemId)).json()).item;
}

async function statusesAsListed(traveller: Traveller, tripId: string) {
  const { items } = await (await traveller.listItems(tripId)).json();
  return Object.fromEntries(items.map((item: { title: string; status: string }) => [item.title, item.status]));
}

// A Trip with three Accommodations to choose between in Monterey.
async function tripWithSuggestions() {
  const { tripId, emil } = await unlockedTrip();
  const monterey = (await (await emil.addStop(tripId, { name: "Monterey" })).json()).stop as { id: string };
  const inMonterey = { category: "accommodation", stopId: monterey.id, date: "2027-07-02", endDate: "2027-07-04" };
  const inn = await addedItem(emil, tripId, { ...inMonterey, title: "Monterey Bay Inn" });
  const hostel = await addedItem(emil, tripId, { ...inMonterey, title: "Cannery Row Hostel" });
  const cabin = await addedItem(emil, tripId, { ...inMonterey, title: "Cabin in the pines" });
  return { tripId, emil, inn, hostel, cabin };
}

describe("a new Item", () => {
  test("starts as a Suggestion", async () => {
    const { tripId, emil } = await unlockedTrip();

    const item = await addedItem(emil, tripId, { category: "activity", title: "Aquarium" });

    expect(item.status).toBe("suggestion");
    expect(await statusesAsListed(emil, tripId)).toEqual({ Aquarium: "suggestion" });
  });

  test("starts as a Suggestion whatever Status it is added with", async () => {
    const { tripId, emil } = await unlockedTrip();

    const item = await addedItem(emil, tripId, { category: "activity", title: "Aquarium", status: "booked" });

    expect(item.status).toBe("suggestion");
  });
});

describe("the Status of an Item", () => {
  test.each(["selected", "booked", "rejected", "suggestion"])("can be changed to %s", async (status) => {
    const { tripId, emil, inn } = await tripWithSuggestions();
    // Away from Suggestion first, so changing back to it is a change too.
    await emil.updateItem(tripId, inn.id, { status: status === "suggestion" ? "selected" : "suggestion" });

    const response = await emil.updateItem(tripId, inn.id, { status });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ item: { ...inn, status } });
    expect(await itemAsRead(emil, tripId, inn.id)).toEqual({ ...inn, status });
  });

  test("can go from any Status to any other", async () => {
    const { tripId, emil, inn } = await tripWithSuggestions();

    for (const status of ["booked", "rejected", "selected", "rejected", "booked", "suggestion", "rejected"]) {
      await emil.updateItem(tripId, inn.id, { status });
      expect((await itemAsRead(emil, tripId, inn.id)).status).toBe(status);
    }
  });

  test("is independent of every other Item's, also in the same Stop and Category", async () => {
    const { tripId, emil, inn, hostel, cabin } = await tripWithSuggestions();

    await emil.updateItem(tripId, inn.id, { status: "selected" });
    await emil.updateItem(tripId, hostel.id, { status: "selected" });

    expect(await statusesAsListed(emil, tripId)).toEqual({
      "Monterey Bay Inn": "selected",
      "Cannery Row Hostel": "selected",
      "Cabin in the pines": "suggestion",
    });

    await emil.updateItem(tripId, inn.id, { status: "booked" });
    await emil.updateItem(tripId, cabin.id, { status: "rejected" });

    expect(await statusesAsListed(emil, tripId)).toEqual({
      "Monterey Bay Inn": "booked",
      "Cannery Row Hostel": "selected",
      "Cabin in the pines": "rejected",
    });
  });

  test("lets several Items in the same Stop and Category be Booked at once", async () => {
    const { tripId, emil, inn, hostel } = await tripWithSuggestions();

    await emil.updateItem(tripId, inn.id, { status: "booked" });
    await emil.updateItem(tripId, hostel.id, { status: "booked" });

    expect(await statusesAsListed(emil, tripId)).toMatchObject({
      "Monterey Bay Inn": "booked",
      "Cannery Row Hostel": "booked",
    });
  });

  test("keeps a Rejected Item on the Trip", async () => {
    const { tripId, emil, cabin } = await tripWithSuggestions();

    await emil.updateItem(tripId, cabin.id, { status: "rejected" });

    expect(await itemAsRead(emil, tripId, cabin.id)).toEqual({ ...cabin, status: "rejected" });
    expect(Object.keys(await statusesAsListed(emil, tripId))).toHaveLength(3);
  });

  test("is left alone when other fields are edited or the Item is moved", async () => {
    const { tripId, emil, inn } = await tripWithSuggestions();
    await emil.updateItem(tripId, inn.id, { status: "booked" });

    await emil.updateItem(tripId, inn.id, { title: "Monterey Bay Inn & Spa", cost: 3200 });
    await emil.updateItem(tripId, inn.id, { stopId: null });

    expect(await itemAsRead(emil, tripId, inn.id)).toMatchObject({ status: "booked", stopId: null, cost: 3200 });
  });

  test.each(["confirmed", "Booked", "", null, 2])("cannot be changed to %j", async (status) => {
    const { tripId, emil, inn } = await tripWithSuggestions();

    const response = await emil.updateItem(tripId, inn.id, { status });

    expect(response.status).toBe(400);
    expect((await response.json()).errors.status).toEqual(expect.any(String));
    expect(await itemAsRead(emil, tripId, inn.id)).toEqual(inn);
  });

  test("cannot be changed by a browser that has not unlocked the Trip", async () => {
    const { tripId, emil, inn } = await tripWithSuggestions();

    const response = await browser().updateItem(tripId, inn.id, { status: "booked" });

    expect(response.status).toBe(401);
    expect(await itemAsRead(emil, tripId, inn.id)).toEqual(inn);
  });
});

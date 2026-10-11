import { beforeEach, describe, expect, test } from "vitest";
import { browser, emptyDatabase, unlockedTrip } from "./support";

beforeEach(emptyDatabase);

type Traveller = ReturnType<typeof browser>;

// A Trip that two travellers have each unlocked in their own browser.
async function sharedTrip() {
  const { tripId, emil } = await unlockedTrip();
  const anna = browser();
  await anna.unlock(tripId, "golden-gate");
  return { tripId, emil, anna };
}

async function addedStop(traveller: Traveller, tripId: string, stop: Record<string, unknown>) {
  return (await (await traveller.addStop(tripId, stop)).json()).stop as { id: string };
}

async function addedItem(traveller: Traveller, tripId: string, item: Record<string, unknown>) {
  return (await (await traveller.addItem(tripId, item)).json()).item as { id: string };
}

async function itemAsRead(traveller: Traveller, tripId: string, itemId: string) {
  return (await (await traveller.readItem(tripId, itemId)).json()).item;
}

async function stopAsRead(traveller: Traveller, tripId: string, stopId: string) {
  return (await (await traveller.readStop(tripId, stopId)).json()).stop;
}

describe("two travellers editing the same Item at once", () => {
  test("both keep their change when they edit different fields", async () => {
    const { tripId, emil, anna } = await sharedTrip();
    const aquarium = await addedItem(emil, tripId, { category: "activity", title: "Aquarium", cost: 100 });

    const responses = await Promise.all([
      emil.updateItem(tripId, aquarium.id, { title: "Monterey Bay Aquarium" }),
      anna.updateItem(tripId, aquarium.id, { notes: "Opens at 10." }),
      emil.updateItem(tripId, aquarium.id, { cost: 450 }),
      anna.updateItem(tripId, aquarium.id, { status: "selected" }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200, 200, 200]);
    expect(await itemAsRead(emil, tripId, aquarium.id)).toMatchObject({
      title: "Monterey Bay Aquarium",
      notes: "Opens at 10.",
      cost: 450,
      status: "selected",
    });
  });

  test("keep one of the two values when they edit the same field", async () => {
    const { tripId, emil, anna } = await sharedTrip();
    const aquarium = await addedItem(emil, tripId, { category: "activity", title: "Aquarium" });

    await Promise.all([
      emil.updateItem(tripId, aquarium.id, { title: "Monterey Bay Aquarium" }),
      anna.updateItem(tripId, aquarium.id, { title: "The aquarium" }),
    ]);

    const { title } = await itemAsRead(emil, tripId, aquarium.id);
    expect(["Monterey Bay Aquarium", "The aquarium"]).toContain(title);
  });

  test("the last write to a field wins, and takes nothing else with it", async () => {
    const { tripId, emil, anna } = await sharedTrip();
    const aquarium = await addedItem(emil, tripId, { category: "activity", title: "Aquarium" });

    await emil.updateItem(tripId, aquarium.id, { title: "Monterey Bay Aquarium", notes: "Opens at 10." });
    await anna.updateItem(tripId, aquarium.id, { title: "The aquarium" });

    expect(await itemAsRead(emil, tripId, aquarium.id)).toMatchObject({
      title: "The aquarium",
      notes: "Opens at 10.",
    });
  });
});

describe("two travellers editing different Items at once", () => {
  test("never overwrite each other", async () => {
    const { tripId, emil, anna } = await sharedTrip();
    const monterey = await addedStop(emil, tripId, { name: "Monterey" });
    const titles = ["Aquarium", "Whale watching", "Cannery Row", "Kayaking", "Fisherman's Wharf", "17-Mile Drive"];
    const items = await Promise.all(
      titles.map((title) => addedItem(emil, tripId, { category: "activity", title, stopId: monterey.id })),
    );

    // Each traveller edits every other Item, all at the same moment.
    const responses = await Promise.all(
      items.map((item, index) =>
        (index % 2 === 0 ? emil : anna).updateItem(tripId, item.id, {
          notes: `Note ${index}`,
          cost: index * 10,
          status: "selected",
        }),
      ),
    );

    expect(responses.map(({ status }) => status)).toEqual(items.map(() => 200));
    const listed = (await (await emil.listItems(tripId)).json()).items as Record<string, unknown>[];
    expect(listed).toHaveLength(items.length);
    for (const [index, item] of items.entries()) {
      expect(listed.find(({ id }) => id === item.id)).toMatchObject({
        title: titles[index],
        stopId: monterey.id,
        notes: `Note ${index}`,
        cost: index * 10,
        status: "selected",
      });
    }
  });
});

describe("two travellers editing Stops at once", () => {
  test("both keep their change when they edit different details of the same Stop", async () => {
    const { tripId, emil, anna } = await sharedTrip();
    const monterey = await addedStop(emil, tripId, { name: "Monterey" });

    const responses = await Promise.all([
      emil.updateStop(tripId, monterey.id, { name: "Monterey Bay" }),
      anna.updateStop(tripId, monterey.id, { notes: "Aquarium opens at 10." }),
      emil.updateStop(tripId, monterey.id, { arrivalDate: "2027-07-02" }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200, 200]);
    expect(await stopAsRead(anna, tripId, monterey.id)).toMatchObject({
      name: "Monterey Bay",
      notes: "Aquarium opens at 10.",
      arrivalDate: "2027-07-02",
    });
  });

  test("never overwrite each other on different Stops", async () => {
    const { tripId, emil, anna } = await sharedTrip();
    const monterey = await addedStop(emil, tripId, { name: "Monterey" });
    const losAngeles = await addedStop(emil, tripId, { name: "Los Angeles" });

    await Promise.all([
      emil.updateStop(tripId, monterey.id, { notes: "Aquarium opens at 10." }),
      anna.updateStop(tripId, losAngeles.id, { notes: "Griffith Observatory at sunset." }),
    ]);

    expect(await stopAsRead(emil, tripId, monterey.id)).toMatchObject({
      name: "Monterey",
      notes: "Aquarium opens at 10.",
    });
    expect(await stopAsRead(emil, tripId, losAngeles.id)).toMatchObject({
      name: "Los Angeles",
      notes: "Griffith Observatory at sunset.",
    });
  });

  test("the last write to a detail wins", async () => {
    const { tripId, emil, anna } = await sharedTrip();
    const monterey = await addedStop(emil, tripId, { name: "Monterey" });

    await emil.updateStop(tripId, monterey.id, { name: "Monterey Bay", notes: "Aquarium opens at 10." });
    await anna.updateStop(tripId, monterey.id, { name: "Monterey, CA" });

    expect(await stopAsRead(emil, tripId, monterey.id)).toMatchObject({
      name: "Monterey, CA",
      notes: "Aquarium opens at 10.",
    });
  });
});

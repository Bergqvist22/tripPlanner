import { beforeEach, describe, expect, test } from "vitest";
import { browser, emptyDatabase, listTrips, unlockedTrip } from "./support";

beforeEach(emptyDatabase);

async function tripAsRead(traveller: ReturnType<typeof browser>, tripId: string) {
  return (await (await traveller.readTrip(tripId)).json()).trip;
}

describe("changing a Trip", () => {
  test("changes its name, creator name, traveller count and display currency", async () => {
    const { tripId, emil } = await unlockedTrip();

    const response = await emil.updateTrip(tripId, {
      name: "Highway 1",
      creatorName: "Emil B",
      travellerCount: 5,
      displayCurrency: "USD",
    });

    const changed = {
      id: tripId,
      name: "Highway 1",
      creatorName: "Emil B",
      travellerCount: 5,
      displayCurrency: "USD",
      hasPassword: true,
    };
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ trip: changed });
    expect(await tripAsRead(emil, tripId)).toEqual(changed);
    expect((await listTrips()).trips).toEqual([{ id: tripId, name: "Highway 1", creatorName: "Emil B" }]);
  });

  test("leaves alone what was not sent", async () => {
    const { tripId, emil } = await unlockedTrip();

    await emil.updateTrip(tripId, { travellerCount: 6 });

    expect(await tripAsRead(emil, tripId)).toEqual({
      id: tripId,
      name: "California road trip",
      creatorName: "Emil",
      travellerCount: 6,
      displayCurrency: "SEK",
      hasPassword: true,
    });
  });

  test("is refused to a browser that has not unlocked the Trip", async () => {
    const { tripId, emil } = await unlockedTrip();

    const response = await browser().updateTrip(tripId, { name: "Hijacked" });

    expect(response.status).toBe(401);
    expect((await tripAsRead(emil, tripId)).name).toBe("California road trip");
  });

  test.each([
    ["travellerCount", 0],
    ["travellerCount", 2.5],
    ["displayCurrency", "XYZ"],
    ["name", "   "],
    ["creatorName", ""],
  ])("is refused with %s set to %j", async (field, value) => {
    const { tripId, emil } = await unlockedTrip();

    const response = await emil.updateTrip(tripId, { [field]: value, name: field === "name" ? value : "Highway 1" });

    expect(response.status).toBe(400);
    expect((await response.json()).errors[field]).toEqual(expect.any(String));
    expect((await tripAsRead(emil, tripId)).name).toBe("California road trip");
  });

  test("does not change the Trip password", async () => {
    const { tripId, emil } = await unlockedTrip();

    await emil.updateTrip(tripId, { password: "alcatraz", passwordHash: "alcatraz" });

    expect((await browser().unlock(tripId, "alcatraz")).status).toBe(403);
    expect((await browser().unlock(tripId, "golden-gate")).status).toBe(200);
  });
});

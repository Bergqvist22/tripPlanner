import { beforeEach, describe, expect, test } from "vitest";
import { browser, createdTripId, emptyDatabase, listTrips, unlockedTrip } from "./support";

beforeEach(emptyDatabase);

describe("deleting a Trip", () => {
  test("with its Trip password removes it for good", async () => {
    const { tripId, emil } = await unlockedTrip();
    const oslo = await createdTripId({ name: "Weekend in Oslo" });

    const response = await emil.deleteTrip(tripId, "golden-gate");

    expect(response.status).toBe(204);
    expect((await listTrips()).trips.map((trip) => trip.id)).toEqual([oslo]);
    expect((await emil.readTrip(tripId)).status).toBe(404);
    expect((await browser().unlock(tripId, "golden-gate")).status).toBe(404);
  });

  test.each(["alcatraz", "", undefined])("is refused when the password given is %j", async (password) => {
    const { tripId, emil } = await unlockedTrip();

    const response = await emil.deleteTrip(tripId, password);

    expect(response.status).toBe(403);
    expect((await response.json()).error).toMatch(/not the Trip password/);
    expect((await emil.readTrip(tripId)).status).toBe(200);
  });

  test("is refused to a browser that has not unlocked the Trip, even with the Trip password", async () => {
    const { tripId, emil } = await unlockedTrip();

    const response = await browser().deleteTrip(tripId, "golden-gate");

    expect(response.status).toBe(401);
    expect((await emil.readTrip(tripId)).status).toBe(200);
  });

  test("without a Trip password takes none, from any browser", async () => {
    const tripId = await createdTripId({ password: undefined });

    const response = await browser().deleteTrip(tripId, undefined);

    expect(response.status).toBe(204);
    expect((await listTrips()).trips).toEqual([]);
  });

  test("is rate limited like unlocking when the password keeps being wrong", async () => {
    const { tripId, emil } = await unlockedTrip();
    for (let attempt = 0; attempt < 5; attempt++) await emil.deleteTrip(tripId, `guess-${attempt}`);

    const response = await emil.deleteTrip(tripId, "golden-gate");

    expect(response.status).toBe(429);
    expect((await emil.readTrip(tripId)).status).toBe(200);
  });
});

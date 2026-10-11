import { beforeEach, describe, expect, test } from "vitest";
import { browser, createdTripId, emptyDatabase } from "./support";

beforeEach(emptyDatabase);

describe("unlocking a Trip", () => {
  test("with the right Trip password shows the Trip", async () => {
    const tripId = await createdTripId({
      name: "California road trip",
      creatorName: "Emil",
      password: "golden-gate",
      travellerCount: 4,
      displayCurrency: "SEK",
    });
    const emil = browser();

    const unlocked = await emil.unlock(tripId, "golden-gate");
    expect(unlocked.status).toBe(200);

    const response = await emil.readTrip(tripId);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      trip: {
        id: tripId,
        name: "California road trip",
        creatorName: "Emil",
        travellerCount: 4,
        displayCurrency: "SEK",
      },
    });
  });

  test("with the wrong Trip password says so and shows nothing", async () => {
    const tripId = await createdTripId({ password: "golden-gate" });
    const stranger = browser();

    const response = await stranger.unlock(tripId, "alcatraz");
    expect(response.status).toBe(403);
    expect((await response.json()).error).toMatch(/not the Trip password/);

    expect((await stranger.readTrip(tripId)).status).toBe(401);
  });

  test.each([undefined, "", 42, null])("is refused when the password given is %j", async (password) => {
    const tripId = await createdTripId();
    expect((await browser().unlock(tripId, password)).status).toBe(403);
  });

  test("answers 404 for a Trip that does not exist", async () => {
    const stranger = browser();
    for (const tripId of ["3f0c1a52-9d0e-4c57-8d1b-0a4a8a0e6c11", "not-an-id"]) {
      expect((await stranger.unlock(tripId, "golden-gate")).status).toBe(404);
      expect((await stranger.readTrip(tripId)).status).toBe(404);
    }
  });

  test("sets a cookie that scripts in the page cannot read", async () => {
    const tripId = await createdTripId({ password: "golden-gate" });
    const response = await browser().unlock(tripId, "golden-gate");

    const [cookie] = response.headers.getSetCookie();
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).not.toContain("golden-gate");
  });
});

describe("a Trip's contents", () => {
  test("are refused to a browser that has not unlocked the Trip", async () => {
    const tripId = await createdTripId({ name: "California road trip", displayCurrency: "SEK" });

    const response = await browser().readTrip(tripId);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });

  test("stay locked when another Trip is unlocked", async () => {
    const california = await createdTripId({ name: "California road trip", password: "golden-gate" });
    const oslo = await createdTripId({ name: "Weekend in Oslo", password: "golden-gate" });
    const emil = browser();

    await emil.unlock(california, "golden-gate");

    expect((await emil.readTrip(oslo)).status).toBe(401);
  });

  test("stay locked when one Trip's unlock is presented for another", async () => {
    const california = await createdTripId({ password: "golden-gate" });
    const oslo = await createdTripId({ password: "golden-gate" });
    const emil = browser();
    await emil.unlock(california, "golden-gate");

    const [[, unlock]] = [...emil.cookies];
    emil.cookies.set(`trip_unlock_${oslo}`, unlock);

    expect((await emil.readTrip(oslo)).status).toBe(401);
  });

  test("stay locked when the unlock has been altered", async () => {
    const tripId = await createdTripId({ password: "golden-gate" });
    const emil = browser();
    await emil.unlock(tripId, "golden-gate");

    // Push the expiry a year out without being able to sign it again.
    const [[name, unlock]] = [...emil.cookies];
    const [expiresAt, signature] = unlock.split(".");
    emil.cookies.set(name, `${Number(expiresAt) + 365 * 24 * 60 * 60}.${signature}`);

    expect((await emil.readTrip(tripId)).status).toBe(401);
  });
});

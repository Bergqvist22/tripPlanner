import { beforeEach, describe, expect, test } from "vitest";
import { POST } from "@/app/api/trips/route";
import { createTrip, emptyDatabase, listTrips } from "./support";

beforeEach(emptyDatabase);

describe("the home page list", () => {
  test("shows a created Trip with its name and creator name, and nothing else", async () => {
    const response = await createTrip({ name: "California road trip", creatorName: "Emil" });
    expect(response.status).toBe(201);

    const { trips } = await listTrips();
    expect(trips).toEqual([{ id: expect.any(String), name: "California road trip", creatorName: "Emil" }]);
  });

  test("lists Trips oldest first", async () => {
    await createTrip({ name: "California road trip" });
    await createTrip({ name: "Weekend in Oslo" });

    const { trips } = await listTrips();
    expect(trips.map((trip) => trip.name)).toEqual(["California road trip", "Weekend in Oslo"]);
  });
});

describe("creating a Trip", () => {
  async function expectRejected(overrides: Record<string, unknown>, field: string) {
    const response = await createTrip(overrides);
    expect(response.status).toBe(400);
    const { errors } = await response.json();
    expect(errors[field]).toEqual(expect.any(String));
    expect((await listTrips()).trips).toEqual([]);
  }

  test("is refused with a traveller count below 1", async () => {
    await expectRejected({ travellerCount: 0 }, "travellerCount");
  });

  test("is refused with a traveller count that is not a whole number", async () => {
    await expectRejected({ travellerCount: 2.5 }, "travellerCount");
  });

  test("accepts a single traveller", async () => {
    const response = await createTrip({ travellerCount: 1 });
    expect(response.status).toBe(201);
  });

  test("is refused with a display currency that does not exist", async () => {
    await expectRejected({ displayCurrency: "XYZ" }, "displayCurrency");
  });

  test("accepts a display currency in lower case", async () => {
    const response = await createTrip({ displayCurrency: "usd" });
    expect(response.status).toBe(201);
  });

  test.each(["name", "creatorName"])("is refused without a %s", async (field) => {
    await expectRejected({ [field]: undefined }, field);
    await expectRejected({ [field]: "   " }, field);
  });

  test.each([undefined, null, ""])("takes no Trip password when the one given is %j", async (password) => {
    const response = await createTrip({ password });
    expect(response.status).toBe(201);
  });

  test.each(["   ", 42])("is refused with %j for a Trip password", async (password) => {
    await expectRejected({ password }, "password");
  });

  test("is refused when the request is not JSON", async () => {
    const response = await POST(new Request("http://localhost/api/trips", { method: "POST", body: "nope" }));
    expect(response.status).toBe(400);
  });

  test("never hands the Trip password back", async () => {
    const response = await createTrip({ password: "golden-gate" });
    expect(JSON.stringify(await response.json())).not.toContain("golden-gate");
    expect(JSON.stringify(await listTrips())).not.toContain("golden-gate");
  });
});

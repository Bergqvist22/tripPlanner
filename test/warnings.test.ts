import { beforeEach, describe, expect, test } from "vitest";
import { browser, emptyDatabase, unlockedTrip } from "./support";

beforeEach(emptyDatabase);

type Traveller = ReturnType<typeof browser>;

// A Trip with Monterey on its Route: arriving 2 July 2027 and leaving on the
// 5th, so with the nights of the 2nd, 3rd and 4th.
async function tripToMonterey(dates: Record<string, unknown> = { arrivalDate: "2027-07-02", departureDate: "2027-07-05" }) {
  const { tripId, emil } = await unlockedTrip();
  const monterey = await addedStop(emil, tripId, { name: "Monterey", ...dates });
  return { tripId, emil, monterey };
}

async function addedStop(traveller: Traveller, tripId: string, stop: Record<string, unknown>) {
  const response = await traveller.addStop(tripId, stop);
  expect(response.status).toBe(201);
  return (await response.json()).stop.id as string;
}

// An Accommodation the group has decided on, unless another Status is given.
async function accommodation(
  traveller: Traveller,
  tripId: string,
  { status = "booked", ...item }: Record<string, unknown>,
) {
  const added = await traveller.addItem(tripId, { category: "accommodation", ...item });
  expect(added.status).toBe(201);
  const { id } = (await added.json()).item as { id: string };
  // A new Item is a Suggestion until its Status is changed.
  if (status !== "suggestion") expect((await traveller.updateItem(tripId, id, { status })).status).toBe(200);
  return id;
}

async function warningsAsRead(traveller: Traveller, tripId: string) {
  const response = await traveller.readWarnings(tripId);
  expect(response.status).toBe(200);
  return (await response.json()).warnings as ({ kind: string } & Record<string, unknown>)[];
}

async function warningsOfKind(traveller: Traveller, tripId: string, kind: string) {
  return (await warningsAsRead(traveller, tripId)).filter((warning) => warning.kind === kind);
}

// The nights the Trip is warned about having no Accommodation for.
async function nightsWithout(traveller: Traveller, tripId: string) {
  return (await warningsOfKind(traveller, tripId, "night-without-accommodation")).map(({ night }) => night);
}

describe("a night without Accommodation", () => {
  test("is warned about for each night of a Stop that nothing covers", async () => {
    const { tripId, emil, monterey } = await tripToMonterey();

    expect(await warningsAsRead(emil, tripId)).toEqual(
      ["2027-07-02", "2027-07-03", "2027-07-04"].map((night) => ({
        kind: "night-without-accommodation",
        stopId: monterey,
        stopName: "Monterey",
        night,
      })),
    );
  });

  test.each(["selected", "booked"])("is covered by a %s Accommodation on the Stop", async (status) => {
    const { tripId, emil, monterey } = await tripToMonterey();
    await accommodation(emil, tripId, { title: "Bay Inn", stopId: monterey, date: "2027-07-02", endDate: "2027-07-05", status });

    expect(await warningsAsRead(emil, tripId)).toEqual([]);
  });

  test("is still warned about where an Accommodation covers only some of the nights", async () => {
    const { tripId, emil, monterey } = await tripToMonterey();
    // Checking out on the 4th leaves the night of the 4th open.
    await accommodation(emil, tripId, { title: "Bay Inn", stopId: monterey, date: "2027-07-03", endDate: "2027-07-04" });

    expect(await nightsWithout(emil, tripId)).toEqual(["2027-07-02", "2027-07-04"]);
  });

  test("is covered by two Accommodations after each other", async () => {
    const { tripId, emil, monterey } = await tripToMonterey();
    await accommodation(emil, tripId, { title: "Bay Inn", stopId: monterey, date: "2027-07-02", endDate: "2027-07-03" });
    await accommodation(emil, tripId, { title: "Hostel", stopId: monterey, date: "2027-07-03", endDate: "2027-07-05", status: "selected" });

    expect(await warningsAsRead(emil, tripId)).toEqual([]);
  });

  test.each(["suggestion", "rejected"])("is not covered by an Accommodation that is a %s", async (status) => {
    const { tripId, emil, monterey } = await tripToMonterey();
    await accommodation(emil, tripId, { title: "Bay Inn", stopId: monterey, date: "2027-07-02", endDate: "2027-07-05", status });

    expect(await nightsWithout(emil, tripId)).toEqual(["2027-07-02", "2027-07-03", "2027-07-04"]);
  });

  test("is not covered by a deleted Accommodation", async () => {
    const { tripId, emil, monterey } = await tripToMonterey();
    const inn = await accommodation(emil, tripId, { title: "Bay Inn", stopId: monterey, date: "2027-07-02", endDate: "2027-07-05" });
    expect(await nightsWithout(emil, tripId)).toEqual([]);

    await emil.deleteItem(tripId, inn);

    expect(await nightsWithout(emil, tripId)).toEqual(["2027-07-02", "2027-07-03", "2027-07-04"]);
  });

  test("is not covered by an Item of another Category on those dates", async () => {
    const { tripId, emil, monterey } = await tripToMonterey();
    const tour = await emil.addItem(tripId, { category: "activity", title: "Road trip tour", stopId: monterey, date: "2027-07-02", endDate: "2027-07-05" });
    await emil.updateItem(tripId, (await tour.json()).item.id, { status: "booked" });

    expect(await nightsWithout(emil, tripId)).toHaveLength(3);
  });

  test("is covered by an Accommodation for the whole Trip, but not by one on another Stop", async () => {
    const { tripId, emil, monterey } = await tripToMonterey();
    const bigSur = await addedStop(emil, tripId, { name: "Big Sur" });
    await accommodation(emil, tripId, { title: "Cabin", stopId: bigSur, date: "2027-07-02", endDate: "2027-07-03" });
    await accommodation(emil, tripId, { title: "Campervan", stopId: null, date: "2027-07-03", endDate: "2027-07-04" });

    expect(await nightsWithout(emil, tripId)).toEqual(["2027-07-02", "2027-07-04"]);
    expect(await warningsOfKind(emil, tripId, "night-without-accommodation")).toMatchObject([{ stopId: monterey }, { stopId: monterey }]);
  });

  test.each([
    ["has zero nights", { arrivalDate: "2027-07-02", departureDate: "2027-07-02" }],
    ["has no dates", {}],
    ["has no departure date", { arrivalDate: "2027-07-02" }],
    ["has no arrival date", { departureDate: "2027-07-05" }],
  ])("is not warned about for a Stop that %s", async (_, dates) => {
    const { tripId, emil } = await tripToMonterey(dates);

    expect(await warningsAsRead(emil, tripId)).toEqual([]);
  });

  test("is not warned about for a deleted Stop", async () => {
    const { tripId, emil, monterey } = await tripToMonterey();

    await emil.deleteStop(tripId, monterey);

    expect(await warningsAsRead(emil, tripId)).toEqual([]);
  });

  test("is told for each Stop, in Route order", async () => {
    const { tripId, emil, monterey } = await tripToMonterey({ arrivalDate: "2027-07-02", departureDate: "2027-07-03" });
    const losAngeles = await addedStop(emil, tripId, { name: "Los Angeles", arrivalDate: "2027-07-03", departureDate: "2027-07-04" });
    await emil.reorderStops(tripId, [losAngeles, monterey]);

    expect(await warningsAsRead(emil, tripId)).toMatchObject([
      { stopName: "Los Angeles", night: "2027-07-03" },
      { stopName: "Monterey", night: "2027-07-02" },
    ]);
  });

  test("follows the dates of the Stop and is worked out anew on each read", async () => {
    const { tripId, emil, monterey } = await tripToMonterey();
    await accommodation(emil, tripId, { title: "Bay Inn", stopId: monterey, date: "2027-07-02", endDate: "2027-07-05" });
    expect(await warningsAsRead(emil, tripId)).toEqual([]);

    await emil.updateStop(tripId, monterey, { departureDate: "2027-07-07" });
    expect(await nightsWithout(emil, tripId)).toEqual(["2027-07-05", "2027-07-06"]);

    await emil.updateStop(tripId, monterey, { departureDate: "2027-07-05" });
    expect(await warningsAsRead(emil, tripId)).toEqual([]);
  });
});

describe("two Accommodations on the same night", () => {
  const threeNights = { date: "2027-07-02", endDate: "2027-07-05" };

  test("are warned about, with the nights both cover", async () => {
    const { tripId, emil, monterey } = await tripToMonterey();
    const inn = await accommodation(emil, tripId, { title: "Bay Inn", stopId: monterey, ...threeNights, status: "booked" });
    const hostel = await accommodation(emil, tripId, { title: "Hostel", stopId: monterey, date: "2027-07-04", endDate: "2027-07-05", status: "selected" });

    expect(await warningsAsRead(emil, tripId)).toEqual([
      {
        kind: "accommodations-overlap",
        accommodations: [
          { itemId: inn, title: "Bay Inn", stopId: monterey },
          { itemId: hostel, title: "Hostel", stopId: monterey },
        ],
        nights: ["2027-07-04"],
      },
    ]);
  });

  test("are not warned about when one checks out the day the other checks in", async () => {
    const { tripId, emil, monterey } = await tripToMonterey();
    await accommodation(emil, tripId, { title: "Bay Inn", stopId: monterey, date: "2027-07-02", endDate: "2027-07-04" });
    await accommodation(emil, tripId, { title: "Hostel", stopId: monterey, date: "2027-07-04", endDate: "2027-07-05" });

    expect(await warningsAsRead(emil, tripId)).toEqual([]);
  });

  test.each(["suggestion", "rejected"])("are not warned about when one of them is a %s", async (status) => {
    const { tripId, emil, monterey } = await tripToMonterey();
    await accommodation(emil, tripId, { title: "Bay Inn", stopId: monterey, ...threeNights });
    await accommodation(emil, tripId, { title: "Hostel", stopId: monterey, ...threeNights, status });

    expect(await warningsAsRead(emil, tripId)).toEqual([]);
  });

  test("are not warned about once one of them is deleted", async () => {
    const { tripId, emil, monterey } = await tripToMonterey();
    await accommodation(emil, tripId, { title: "Bay Inn", stopId: monterey, ...threeNights });
    const hostel = await accommodation(emil, tripId, { title: "Hostel", stopId: monterey, ...threeNights });
    expect(await warningsOfKind(emil, tripId, "accommodations-overlap")).toHaveLength(1);

    await emil.deleteItem(tripId, hostel);

    expect(await warningsAsRead(emil, tripId)).toEqual([]);
  });

  test("are warned about wherever the two are: on different Stops or on the whole Trip", async () => {
    const { tripId, emil, monterey } = await tripToMonterey();
    const bigSur = await addedStop(emil, tripId, { name: "Big Sur" });
    await accommodation(emil, tripId, { title: "Bay Inn", stopId: monterey, ...threeNights });
    await accommodation(emil, tripId, { title: "Cabin", stopId: bigSur, date: "2027-07-04", endDate: "2027-07-06" });
    await accommodation(emil, tripId, { title: "Campervan", stopId: null, date: "2027-07-05", endDate: "2027-07-06" });

    expect(await warningsOfKind(emil, tripId, "accommodations-overlap")).toMatchObject([
      { accommodations: [{ title: "Bay Inn", stopId: monterey }, { title: "Cabin", stopId: bigSur }], nights: ["2027-07-04"] },
      { accommodations: [{ title: "Cabin" }, { title: "Campervan", stopId: null }], nights: ["2027-07-05"] },
    ]);
  });

  test("are warned about pair by pair when three cover the same night", async () => {
    const { tripId, emil, monterey } = await tripToMonterey();
    for (const title of ["Bay Inn", "Hostel", "Cabin"]) await accommodation(emil, tripId, { title, stopId: monterey, ...threeNights });

    expect(await warningsOfKind(emil, tripId, "accommodations-overlap")).toHaveLength(3);
  });
});

describe("an Accommodation outside the dates of its Stop", () => {
  test.each([
    ["checks in before the Stop is arrived at", { date: "2027-07-01", endDate: "2027-07-05" }],
    ["checks out after the Stop is left", { date: "2027-07-02", endDate: "2027-07-06" }],
    ["is in another month altogether", { date: "2027-08-02", endDate: "2027-08-05" }],
  ])("is warned about when it %s", async (_, dates) => {
    const { tripId, emil, monterey } = await tripToMonterey();
    const inn = await accommodation(emil, tripId, { title: "Bay Inn", stopId: monterey, ...dates });

    expect(await warningsOfKind(emil, tripId, "accommodation-outside-stop")).toEqual([
      {
        kind: "accommodation-outside-stop",
        stopId: monterey,
        stopName: "Monterey",
        accommodation: { itemId: inn, title: "Bay Inn", stopId: monterey },
        checkIn: dates.date,
        checkOut: dates.endDate,
      },
    ]);
  });

  test("is not warned about when it is within them, also for part of the Stop", async () => {
    const { tripId, emil, monterey } = await tripToMonterey();
    await accommodation(emil, tripId, { title: "Bay Inn", stopId: monterey, date: "2027-07-03", endDate: "2027-07-04" });

    expect(await warningsOfKind(emil, tripId, "accommodation-outside-stop")).toEqual([]);
  });

  test.each(["suggestion", "rejected"])("is not warned about when it is a %s", async (status) => {
    const { tripId, emil, monterey } = await tripToMonterey();
    await accommodation(emil, tripId, { title: "Bay Inn", stopId: monterey, date: "2027-08-02", endDate: "2027-08-05", status });

    expect(await warningsOfKind(emil, tripId, "accommodation-outside-stop")).toEqual([]);
  });

  test("is not warned about once it is deleted", async () => {
    const { tripId, emil, monterey } = await tripToMonterey();
    const inn = await accommodation(emil, tripId, { title: "Bay Inn", stopId: monterey, date: "2027-08-02", endDate: "2027-08-05" });

    await emil.deleteItem(tripId, inn);

    expect(await warningsOfKind(emil, tripId, "accommodation-outside-stop")).toEqual([]);
  });

  test("is checked against the dates the Stop has", async () => {
    const { tripId, emil, monterey } = await tripToMonterey({ arrivalDate: "2027-07-02" });
    await accommodation(emil, tripId, { title: "Late", stopId: monterey, date: "2027-07-02", endDate: "2027-09-01" });
    await accommodation(emil, tripId, { title: "Early", stopId: monterey, date: "2027-07-01", endDate: "2027-07-02" });

    expect(await warningsOfKind(emil, tripId, "accommodation-outside-stop")).toMatchObject([{ accommodation: { title: "Early" } }]);
  });

  test("is never warned about on a Stop without dates, or for the whole Trip", async () => {
    const { tripId, emil, monterey } = await tripToMonterey({});
    await accommodation(emil, tripId, { title: "Bay Inn", stopId: monterey, date: "2027-07-02", endDate: "2027-07-05" });
    await accommodation(emil, tripId, { title: "Campervan", stopId: null, date: "2027-08-02", endDate: "2027-08-05" });

    expect(await warningsAsRead(emil, tripId)).toEqual([]);
  });

  test("is warned about on a Stop with zero nights", async () => {
    const { tripId, emil, monterey } = await tripToMonterey({ arrivalDate: "2027-07-02", departureDate: "2027-07-02" });
    await accommodation(emil, tripId, { title: "Bay Inn", stopId: monterey, date: "2027-07-02", endDate: "2027-07-03" });

    expect(await warningsAsRead(emil, tripId)).toMatchObject([{ kind: "accommodation-outside-stop" }]);
  });
});

describe("the warnings of a Trip", () => {
  test("stop at a year of nights for a Stop whose dates are years apart", async () => {
    const { tripId, emil } = await tripToMonterey({ arrivalDate: "2027-07-02", departureDate: "2072-07-05" });

    expect(await nightsWithout(emil, tripId)).toHaveLength(366);
  });

  test("are none for a Trip without Stops", async () => {
    const { tripId, emil } = await unlockedTrip();

    expect(await warningsAsRead(emil, tripId)).toEqual([]);
  });

  test("are shown only to a browser that has unlocked the Trip", async () => {
    const { tripId } = await tripToMonterey();

    const response = await browser().readWarnings(tripId);

    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty("warnings");
  });

  test("are those of that Trip alone", async () => {
    const mine = await tripToMonterey({});
    await tripToMonterey();

    expect(await warningsAsRead(mine.emil, mine.tripId)).toEqual([]);
  });
});

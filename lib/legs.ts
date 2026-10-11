import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { legs, stops as stopsTable } from "@/db/schema";
import { calculatedDrive, type Drive } from "./route-calculation";
import { listStops, type Stop } from "./stops";
import { TRAVEL_MODES, type TravelMode } from "./travel-modes";
import { fieldErrors, type FieldErrors, type Trip } from "./trips";

// Where the calculated drive of a Leg stands: there is one, no road joins the
// two Stops, the service could not be asked, or a Stop has no place to drive
// to or from.
export type Calculation = "calculated" | "no-road" | "unavailable" | "without-places";

// The stretch between two consecutive Stops, as travellers see it.
export type Leg = {
  fromStopId: string;
  toStopId: string;
  travelMode: TravelMode;
  // The travel time that counts: the one entered by hand if there is one,
  // otherwise the calculated one.
  durationMinutes: number | null;
  manualDurationMinutes: number | null;
  // Only a Drive is calculated.
  calculatedDurationMinutes: number | null;
  distanceMeters: number | null;
  calculation: Calculation | null;
};

// A Leg with the road its drive follows, for the map: points of latitude and
// longitude. Null when the Leg is drawn as a straight line.
export type DrawnLeg = { leg: Leg; road: Drive["road"] | null };

type StoredLeg = typeof legs.$inferSelect;

const pairOf = (fromStopId: string, toStopId: string) => `${fromStopId}>${toStopId}`;

function inMinutes(seconds: number) {
  return Math.max(1, Math.round(seconds / 60));
}

function legContents(from: Stop, to: Stop, stored: StoredLeg | undefined): DrawnLeg {
  const travelMode = stored?.travelMode ?? "drive";
  let calculation: Calculation | null = null;
  if (travelMode === "drive") {
    if (!from.place || !to.place) calculation = "without-places";
    else if (!stored?.calculatedAt) calculation = "unavailable";
    else calculation = stored.calculatedDurationSeconds === null ? "no-road" : "calculated";
  }
  const calculated = calculation === "calculated" ? stored : undefined;
  const calculatedDurationMinutes =
    calculated?.calculatedDurationSeconds == null ? null : inMinutes(calculated.calculatedDurationSeconds);
  const manualDurationMinutes =
    stored?.manualDurationSeconds == null ? null : inMinutes(stored.manualDurationSeconds);
  return {
    leg: {
      fromStopId: from.id,
      toStopId: to.id,
      travelMode,
      durationMinutes: manualDurationMinutes ?? calculatedDurationMinutes,
      manualDurationMinutes,
      calculatedDurationMinutes,
      distanceMeters: calculated?.calculatedDistanceMeters ?? null,
      calculation,
    },
    road: (calculated?.calculatedGeometry as Drive["road"] | null | undefined) ?? null,
  };
}

// The Legs of a Trip, for its Stops in Route order: one per pair of
// consecutive Stops. A Leg is never created by hand. What is known about a
// pair is kept, so a Drive is calculated once and again only when one of its
// Stops is given another place; reordering calculates the new pairs alone.
export async function legsOf(stops: Stop[]): Promise<DrawnLeg[]> {
  if (stops.length < 2) return [];
  const pairs = stops.slice(1).map((to, index) => ({ from: stops[index], to }));
  const stopIds = stops.map((stop) => stop.id);
  const stored = await db()
    .select()
    .from(legs)
    .where(and(inArray(legs.fromStopId, stopIds), inArray(legs.toStopId, stopIds)));
  const known = new Map(stored.map((leg) => [pairOf(leg.fromStopId, leg.toStopId), leg]));

  // One drive at a time: a free service is not sent a whole Route at once.
  for (const { from, to } of pairs) {
    const leg = known.get(pairOf(from.id, to.id));
    if ((leg?.travelMode ?? "drive") !== "drive" || !from.place || !to.place || leg?.calculatedAt) continue;
    const drive = await calculatedDrive(from.place, to.place);
    if (drive === undefined) continue;
    const calculated = {
      calculatedDurationSeconds: drive && Math.round(drive.durationSeconds),
      calculatedDistanceMeters: drive && Math.round(drive.distanceMeters),
      calculatedGeometry: drive && drive.road,
      calculatedAt: new Date(),
    };
    const kept = await db().transaction(async (tx) => {
      // The two Stops are held where they are while the drive is kept. One
      // that was given another place meanwhile leaves it to be calculated anew.
      const held = await tx
        .select({ id: stopsTable.id, latitude: stopsTable.placeLatitude, longitude: stopsTable.placeLongitude })
        .from(stopsTable)
        .where(or(eq(stopsTable.id, from.id), eq(stopsTable.id, to.id)))
        .for("share");
      const stayed = [from, to].every(({ id, place }) =>
        held.some((stop) => stop.id === id && stop.latitude === place?.latitude && stop.longitude === place?.longitude),
      );
      if (!stayed) return undefined;
      const [stored] = await tx
        .insert(legs)
        .values({ fromStopId: from.id, toStopId: to.id, ...calculated })
        .onConflictDoUpdate({ target: [legs.fromStopId, legs.toStopId], set: calculated })
        .returning();
      return stored;
    });
    if (kept) known.set(pairOf(from.id, to.id), kept);
  }

  return pairs.map(({ from, to }) => legContents(from, to, known.get(pairOf(from.id, to.id))));
}

// How long the Trip's travelling takes in all. A Leg without a travel time is
// counted, not guessed at.
export type Travel = { legs: Leg[]; totalTravelMinutes: number; legsWithoutTravelTime: number };

export function travelOf(drawn: DrawnLeg[]): Travel {
  const travelled = drawn.map(({ leg }) => leg);
  return {
    legs: travelled,
    totalTravelMinutes: travelled.reduce((total, leg) => total + (leg.durationMinutes ?? 0), 0),
    legsWithoutTravelTime: travelled.filter((leg) => leg.durationMinutes === null).length,
  };
}

// As long as a month: more is a typing mistake.
const LONGEST_DURATION_MINUTES = 30 * 24 * 60;

// Only what is sent is changed. A travel time of null goes back to the calculated one.
const legChangesSchema = z
  .object({
    travelMode: z.enum(TRAVEL_MODES, { error: "Choose a travel mode" }),
    manualDurationMinutes: z
      .number({ error: "Enter the travel time in hours and minutes" })
      .int("Enter the travel time in whole minutes")
      .min(1, "A travel time is at least 1 minute")
      .max(LONGEST_DURATION_MINUTES, "A travel time can be at most 30 days")
      .nullable(),
  })
  .partial();

export type LegChanges = z.infer<typeof legChangesSchema>;

export function parseLegChanges(input: unknown): { changes: LegChanges } | { errors: FieldErrors } {
  const result = legChangesSchema.safeParse(input);
  return result.success ? { changes: result.data } : { errors: fieldErrors(result.error) };
}

// For a Trip that has already been opened (lib/access.ts). Undefined when the
// two Stops are not next to each other on the Trip's Route: there is no such
// Leg, or no longer.
export async function updateLeg(
  trip: Trip,
  fromStopId: string,
  toStopId: string,
  { travelMode, manualDurationMinutes }: LegChanges,
): Promise<Leg | undefined> {
  const stops = await listStops(trip);
  const index = stops.findIndex((stop) => stop.id === fromStopId);
  if (index < 0 || stops[index + 1]?.id !== toStopId) return undefined;

  const changed = {
    ...(travelMode !== undefined && { travelMode }),
    ...(manualDurationMinutes !== undefined && {
      manualDurationSeconds: manualDurationMinutes && manualDurationMinutes * 60,
    }),
  };
  if (Object.keys(changed).length > 0) {
    await db()
      .insert(legs)
      .values({ fromStopId, toStopId, ...changed })
      .onConflictDoUpdate({ target: [legs.fromStopId, legs.toStopId], set: changed });
  }
  return travelOf(await legsOf(stops)).legs[index];
}

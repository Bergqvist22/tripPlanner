import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { stops } from "@/db/schema";
import { z } from "zod";
import { fieldErrors, requiredText, type FieldErrors, type Trip } from "./trips";

// A calendar date, or null for one that is not decided yet.
const optionalDate = (message: string) => z.iso.date(message).nullable();

const stopDetailsSchema = z.object({
  name: requiredText("Give the Stop a name"),
  arrivalDate: optionalDate("Enter a valid arrival date"),
  departureDate: optionalDate("Enter a valid departure date"),
  notes: z.string({ error: "Notes must be text" }).max(10_000, "Notes can be at most 10,000 characters"),
});

type StopDates = { arrivalDate: string | null; departureDate: string | null };

// Leaving on the day of arrival is fine: a Stop may have zero nights.
function nights({ arrivalDate, departureDate }: StopDates) {
  if (!arrivalDate || !departureDate) return null;
  return Math.round((Date.parse(departureDate) - Date.parse(arrivalDate)) / (24 * 60 * 60 * 1000));
}

function departsBeforeArriving(dates: StopDates) {
  return (nights(dates) ?? 0) < 0;
}

const DEPARTURE_BEFORE_ARRIVAL: FieldErrors = { departureDate: "Departure cannot be before arrival" };

const newStopSchema = stopDetailsSchema.partial({ arrivalDate: true, departureDate: true, notes: true });

// Only the details that are sent are changed.
const stopChangesSchema = stopDetailsSchema.partial();

export type NewStop = z.infer<typeof newStopSchema>;
export type StopChanges = z.infer<typeof stopChangesSchema>;

export function parseNewStop(input: unknown): { stop: NewStop } | { errors: FieldErrors } {
  const result = newStopSchema.safeParse(input);
  if (!result.success) return { errors: fieldErrors(result.error) };
  const { arrivalDate = null, departureDate = null } = result.data;
  if (departsBeforeArriving({ arrivalDate, departureDate })) return { errors: DEPARTURE_BEFORE_ARRIVAL };
  return { stop: result.data };
}

// Whether the dates still fit the ones the Stop already has is checked when
// the changes are made (updateStop).
export function parseStopChanges(input: unknown): { changes: StopChanges } | { errors: FieldErrors } {
  const result = stopChangesSchema.safeParse(input);
  return result.success ? { changes: result.data } : { errors: fieldErrors(result.error) };
}

// A Stop as travellers see it. Dates are calendar dates (YYYY-MM-DD); nights
// is known once both are.
export type Stop = {
  id: string;
  name: string;
  arrivalDate: string | null;
  departureDate: string | null;
  nights: number | null;
  notes: string;
};

function stopContents({ id, name, arrivalDate, departureDate, notes }: typeof stops.$inferSelect): Stop {
  return { id, name, arrivalDate, departureDate, nights: nights({ arrivalDate, departureDate }), notes };
}

const stopIdSchema = z.uuid();

// The Trip's Stops that have not been deleted.
function onRoute(trip: Trip) {
  return and(eq(stops.tripId, trip.id), isNull(stops.deletedAt));
}

function isStopOf(trip: Trip, stopId: string) {
  return and(eq(stops.id, stopId), onRoute(trip));
}

// Everything below is for a Trip that has already been opened (lib/access.ts).

// A new Stop goes last on the Route.
export async function addStop(trip: Trip, stop: NewStop): Promise<Stop> {
  const [added] = await db()
    .insert(stops)
    .values({
      ...stop,
      tripId: trip.id,
      position: sql`(SELECT coalesce(max(position), -1) + 1 FROM stops WHERE trip_id = ${trip.id})`,
    })
    .returning();
  return stopContents(added);
}

// Stops added at the same moment can share a position; the older one goes first.
const routeOrder = [asc(stops.position), asc(stops.createdAt), asc(stops.id)];

// The Trip's Stops in Route order.
export async function listStops(trip: Trip): Promise<Stop[]> {
  const listed = await db()
    .select()
    .from(stops)
    .where(onRoute(trip))
    .orderBy(...routeOrder);
  return listed.map(stopContents);
}

export async function findStop(trip: Trip, stopId: string): Promise<Stop | undefined> {
  if (!stopIdSchema.safeParse(stopId).success) return undefined;
  const [found] = await db().select().from(stops).where(isStopOf(trip, stopId));
  return found && stopContents(found);
}

// Undefined when the Trip has no such Stop.
export async function updateStop(
  trip: Trip,
  stopId: string,
  changes: StopChanges,
): Promise<{ stop: Stop } | { errors: FieldErrors } | undefined> {
  if (!stopIdSchema.safeParse(stopId).success) return undefined;
  return db().transaction(async (tx) => {
    // Locked, so the dates cannot change between the check and the write.
    const [stored] = await tx.select().from(stops).where(isStopOf(trip, stopId)).for("update");
    if (!stored) return undefined;
    if (departsBeforeArriving({ ...stored, ...changes })) return { errors: DEPARTURE_BEFORE_ARRIVAL };
    if (Object.keys(changes).length === 0) return { stop: stopContents(stored) };
    const [updated] = await tx
      .update(stops)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(stops.id, stopId))
      .returning();
    return { stop: stopContents(updated) };
  });
}

const stopOrderSchema = z.object({ stopIds: z.array(z.uuid().toLowerCase()).max(1000) });

export function parseStopOrder(input: unknown): { stopIds: string[] } | undefined {
  const result = stopOrderSchema.safeParse(input);
  return result.success ? result.data : undefined;
}

// Puts the Trip's Stops in the order given, as one operation, so two reorders
// at once cannot interleave into a mix of both. Undefined when the order is
// not exactly the Trip's Stops, each once: the Route has changed meanwhile.
export async function reorderStops(trip: Trip, stopIds: string[]): Promise<Stop[] | undefined> {
  return db().transaction(async (tx) => {
    // Locked in a fixed order, so the next reorder waits for this one.
    const current = await tx.select({ id: stops.id }).from(stops).where(onRoute(trip)).orderBy(asc(stops.id)).for("update");
    const given = new Set(stopIds);
    if (given.size !== stopIds.length || given.size !== current.length || !current.every(({ id }) => given.has(id))) {
      return undefined;
    }
    await tx.execute(sql`
      UPDATE stops SET position = placed.position - 1, updated_at = now()
      FROM jsonb_array_elements_text(${JSON.stringify(stopIds)}::jsonb) WITH ORDINALITY AS placed (id, position)
      WHERE stops.id = placed.id::uuid AND stops.trip_id = ${trip.id}
    `);
    const reordered = await tx.select().from(stops).where(onRoute(trip)).orderBy(...routeOrder);
    return reordered.map(stopContents);
  });
}

// The Stop is marked as deleted rather than removed, so it can be restored
// from Recently deleted. False when the Trip has no such Stop.
export async function deleteStop(trip: Trip, stopId: string): Promise<boolean> {
  if (!stopIdSchema.safeParse(stopId).success) return false;
  const now = new Date();
  const deleted = await db()
    .update(stops)
    .set({ deletedAt: now, updatedAt: now })
    .where(isStopOf(trip, stopId))
    .returning({ id: stops.id });
  return deleted.length > 0;
}

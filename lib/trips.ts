import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { trips } from "@/db/schema";
import { z } from "zod";
import { isCurrency } from "./currency";
import { hashPassword, PASSWORD_MAX_LENGTH } from "./password";

export const requiredText = (message: string) => z.string({ error: message }).trim().min(1, message).max(100);

// A calendar date, or null for one that is not decided yet.
export const optionalDate = (message: string) => z.iso.date(message).nullable();

const tripDetailsSchema = z.object({
  name: requiredText("Give the Trip a name"),
  creatorName: requiredText("Enter your name"),
  travellerCount: z
    .number({ error: "Enter how many travellers there are" })
    .int("Traveller count must be a whole number")
    .min(1, "A Trip has at least 1 traveller")
    .max(1000),
  displayCurrency: z
    .string({ error: "Choose a display currency" })
    .trim()
    .toUpperCase()
    .refine(isCurrency, "Choose a valid currency"),
});

const newTripSchema = tripDetailsSchema.extend({
  // Not trimmed: the Trip password is kept exactly as typed.
  password: z
    .string({ error: "Choose a Trip password" })
    .max(PASSWORD_MAX_LENGTH)
    .refine((password) => password.trim() !== "", "Choose a Trip password"),
});

// Only the details that are sent are changed. The Trip password is not among
// them: it cannot be changed from within the app.
const tripChangesSchema = tripDetailsSchema.partial();

export type NewTrip = z.infer<typeof newTripSchema>;
export type TripChanges = z.infer<typeof tripChangesSchema>;

// One message per field that was wrong.
export type FieldErrors = Record<string, string>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    errors[String(issue.path[0] ?? "request")] ??= issue.message;
  }
  return errors;
}

export function parseNewTrip(input: unknown): { trip: NewTrip } | { errors: FieldErrors } {
  const result = newTripSchema.safeParse(input);
  return result.success ? { trip: result.data } : { errors: fieldErrors(result.error) };
}

export function parseTripChanges(input: unknown): { changes: TripChanges } | { errors: FieldErrors } {
  const result = tripChangesSchema.safeParse(input);
  return result.success ? { changes: result.data } : { errors: fieldErrors(result.error) };
}

// What anyone may see of a Trip without its Trip password (ADR 0002).
export type TripSummary = { id: string; name: string; creatorName: string };

export async function createTrip(input: NewTrip): Promise<TripSummary> {
  const { password, ...trip } = input;
  const [created] = await db()
    .insert(trips)
    .values({ ...trip, passwordHash: await hashPassword(password) })
    .returning({ id: trips.id, name: trips.name, creatorName: trips.creatorName });
  return created;
}

export function listTrips(): Promise<TripSummary[]> {
  return db()
    .select({ id: trips.id, name: trips.name, creatorName: trips.creatorName })
    .from(trips)
    .orderBy(asc(trips.createdAt));
}

// What a Trip holds behind its Trip password.
export type Trip = TripSummary & { travellerCount: number; displayCurrency: string };

const tripIdSchema = z.uuid();

export type StoredTrip = typeof trips.$inferSelect;

// The whole stored row, password hash included: only for lib/access.ts and
// never for a response.
export async function findStoredTrip(id: string): Promise<StoredTrip | undefined> {
  if (!tripIdSchema.safeParse(id).success) return undefined;
  const [stored] = await db().select().from(trips).where(eq(trips.id, id));
  return stored;
}

export async function findTripSummary(id: string): Promise<TripSummary | undefined> {
  const stored = await findStoredTrip(id);
  return stored && { id: stored.id, name: stored.name, creatorName: stored.creatorName };
}

export function tripContents({ id, name, creatorName, travellerCount, displayCurrency }: StoredTrip): Trip {
  return { id, name, creatorName, travellerCount, displayCurrency };
}

// For a Trip that has already been opened (lib/access.ts).
export async function updateTrip(trip: Trip, changes: TripChanges): Promise<Trip> {
  if (Object.keys(changes).length === 0) return trip;
  const [updated] = await db().update(trips).set(changes).where(eq(trips.id, trip.id)).returning();
  return updated ? tripContents(updated) : trip;
}

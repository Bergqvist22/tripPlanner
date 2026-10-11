import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { trips } from "@/db/schema";
import { z } from "zod";
import { isCurrency } from "./currency";
import { hashPassword } from "./password";

const requiredText = (message: string) => z.string({ error: message }).trim().min(1, message).max(100);

const newTripSchema = z.object({
  name: requiredText("Give the Trip a name"),
  creatorName: requiredText("Enter your name"),
  // Not trimmed: the Trip password is kept exactly as typed.
  password: z
    .string({ error: "Choose a Trip password" })
    .max(200)
    .refine((password) => password.trim() !== "", "Choose a Trip password"),
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

export type NewTrip = z.infer<typeof newTripSchema>;

// One message per field that was wrong.
export type FieldErrors = Record<string, string>;

export function parseNewTrip(input: unknown): { trip: NewTrip } | { errors: FieldErrors } {
  const result = newTripSchema.safeParse(input);
  if (result.success) return { trip: result.data };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    errors[String(issue.path[0] ?? "request")] ??= issue.message;
  }
  return { errors };
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

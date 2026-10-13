import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { trips } from "@/db/schema";
import { verifyPassword } from "./password";
import { findStoredTrip, tripContents, type StoredTrip, type Trip } from "./trips";

// Access to a Trip's contents (ADR 0002). A Trip without a Trip password is
// open to everyone. For one that has a Trip password, a browser that has given
// it holds an unlock: a signed cookie that is good for one Trip only.

type TripWithPassword = StoredTrip & { passwordHash: string };

function hasPassword(trip: StoredTrip): trip is TripWithPassword {
  return trip.passwordHash !== null;
}

const UNLOCK_LIFETIME_SECONDS = 180 * 24 * 60 * 60;

export function unlockCookieName(tripId: string) {
  return `trip_unlock_${tripId}`;
}

// The signing key is the Trip's password hash, which never leaves the server.
// An unlock therefore cannot be moved to another Trip, and stops working when
// the operator resets the Trip password.
function signature(trip: TripWithPassword, expiresAt: number) {
  return createHmac("sha256", trip.passwordHash).update(`${trip.id}.${expiresAt}`).digest("hex");
}

// The Set-Cookie header that unlocks the Trip in the browser receiving it.
function unlockCookie(trip: TripWithPassword) {
  const expiresAt = Math.floor(Date.now() / 1000) + UNLOCK_LIFETIME_SECONDS;
  const attributes = [
    `${unlockCookieName(trip.id)}=${expiresAt}.${signature(trip, expiresAt)}`,
    "Path=/",
    `Max-Age=${UNLOCK_LIFETIME_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  return attributes.join("; ");
}

function isValidUnlock(trip: TripWithPassword, unlock: string | undefined) {
  const [expires, signed] = (unlock ?? "").split(".");
  const expiresAt = Number(expires);
  if (!signed || !Number.isInteger(expiresAt) || expiresAt * 1000 <= Date.now()) return false;
  const expected = Buffer.from(signature(trip, expiresAt));
  const actual = Buffer.from(signed);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export type Refusal = "not-found" | "locked" | "wrong-password" | "too-many-attempts";

export type Refused = { refused: Refusal; retryAfterSeconds?: number };

// A Trip takes 5 wrong Trip passwords per 15 minutes, counted from the first
// wrong one. After that every attempt is refused until the 15 minutes are up.
const WRONG_PASSWORD_LIMIT = 5;
const WRONG_PASSWORD_WINDOW_MS = 15 * 60 * 1000;

// Checks a Trip password, whether for unlocking the Trip or deleting it. A
// Trip without one asks for none, so nothing given for it is wrong.
async function checkTripPassword(tripId: string, password: unknown): Promise<{ trip: StoredTrip } | Refused> {
  const stored = await findStoredTrip(tripId);
  if (!stored) return { refused: "not-found" };
  if (!hasPassword(stored)) return { trip: stored };

  const now = Date.now();
  const windowOver = or(
    isNull(trips.wrongPasswordsSince),
    lte(trips.wrongPasswordsSince, new Date(now - WRONG_PASSWORD_WINDOW_MS)),
  );
  // The attempt is counted as wrong before it is checked, in one statement,
  // so guesses sent at the same time cannot slip past the limit.
  const [trip] = await db()
    .update(trips)
    .set({
      wrongPasswordCount: sql`CASE WHEN ${windowOver} THEN 1 ELSE ${trips.wrongPasswordCount} + 1 END`,
      wrongPasswordsSince: sql`CASE WHEN ${windowOver} THEN ${new Date(now).toISOString()}::timestamptz ELSE ${trips.wrongPasswordsSince} END`,
    })
    .where(and(eq(trips.id, tripId), or(windowOver, lt(trips.wrongPasswordCount, WRONG_PASSWORD_LIMIT))))
    .returning();

  if (!trip) {
    const limited = await findStoredTrip(tripId);
    if (!limited) return { refused: "not-found" };
    const windowEnds = (limited.wrongPasswordsSince?.getTime() ?? now) + WRONG_PASSWORD_WINDOW_MS;
    return { refused: "too-many-attempts", retryAfterSeconds: Math.max(1, Math.ceil((windowEnds - now) / 1000)) };
  }

  if (typeof password !== "string" || !(await verifyPassword(password, stored.passwordHash))) {
    return { refused: "wrong-password" };
  }
  await db().update(trips).set({ wrongPasswordCount: 0, wrongPasswordsSince: null }).where(eq(trips.id, tripId));
  return { trip };
}

// A Trip without a Trip password has nothing to unlock, and sets no cookie.
export async function unlockTrip(
  tripId: string,
  password: unknown,
): Promise<{ unlockCookie: string | undefined } | Refused> {
  const checked = await checkTripPassword(tripId, password);
  if ("refused" in checked) return checked;
  return { unlockCookie: hasPassword(checked.trip) ? unlockCookie(checked.trip) : undefined };
}

// The Trip's contents, for a browser holding a valid unlock for this Trip, or
// for any browser when the Trip has no Trip password. Every read and write of
// Trip contents starts here.
export async function openTrip(tripId: string, unlock: string | undefined): Promise<{ trip: Trip } | Refused> {
  const trip = await findStoredTrip(tripId);
  if (!trip) return { refused: "not-found" };
  if (hasPassword(trip) && !isValidUnlock(trip, unlock)) return { refused: "locked" };
  return { trip: tripContents(trip) };
}

// Deleting a Trip takes its Trip password again, on top of the unlock, when it
// has one, and is permanent: the Trip's Stops and Items go with it.
export async function deleteTrip(
  tripId: string,
  unlock: string | undefined,
  password: unknown,
): Promise<{ deleted: true } | Refused> {
  const opened = await openTrip(tripId, unlock);
  if ("refused" in opened) return opened;
  const checked = await checkTripPassword(tripId, password);
  if ("refused" in checked) return checked;
  await db().delete(trips).where(eq(trips.id, tripId));
  return { deleted: true };
}

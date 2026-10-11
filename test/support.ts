import { sql } from "drizzle-orm";
import * as tripRoute from "@/app/api/trips/[tripId]/route";
import { POST as unlockTrip } from "@/app/api/trips/[tripId]/unlock/route";
import { GET, POST } from "@/app/api/trips/route";
import { db } from "@/db/client";

export async function emptyDatabase() {
  await db().execute(sql`TRUNCATE trips CASCADE`);
}

const californiaRoadTrip = {
  name: "California road trip",
  creatorName: "Emil",
  password: "golden-gate",
  travellerCount: 4,
  displayCurrency: "SEK",
};

// Creates a Trip through the server API. Any field can be overridden, or
// removed by passing undefined.
export function createTrip(overrides: Record<string, unknown> = {}) {
  return POST(
    new Request("http://localhost/api/trips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...californiaRoadTrip, ...overrides }),
    }),
  );
}

export async function listTrips() {
  const response = await GET();
  return (await response.json()) as { trips: Record<string, unknown>[] };
}

// Creates a Trip and returns its id.
export async function createdTripId(overrides: Record<string, unknown> = {}) {
  const response = await createTrip(overrides);
  const { trip } = (await response.json()) as { trip: { id: string } };
  return trip.id;
}

// One traveller's browser: it keeps the cookies the server sets and sends
// them back, so a Trip unlocked in one browser stays locked in another.
export function browser() {
  const cookies = new Map<string, string>();

  async function send(
    handler: (request: Request, context: { params: Promise<{ tripId: string }> }) => Promise<Response>,
    method: string,
    tripId: string,
    body?: unknown,
  ) {
    const headers = new Headers({ "content-type": "application/json" });
    if (cookies.size > 0) {
      headers.set("cookie", [...cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    }
    const response = await handler(
      new Request(`http://localhost/api/trips/${tripId}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { params: Promise.resolve({ tripId }) },
    );
    for (const cookie of response.headers.getSetCookie()) {
      const [name, value] = cookie.split(";")[0].split("=");
      cookies.set(name, value);
    }
    return response;
  }

  return {
    cookies,
    unlock: (tripId: string, password: unknown) => send(unlockTrip, "POST", tripId, { password }),
    readTrip: (tripId: string) => send(tripRoute.GET, "GET", tripId),
    updateTrip: (tripId: string, changes: unknown) => send(tripRoute.PATCH, "PATCH", tripId, changes),
    deleteTrip: (tripId: string, password: unknown) => send(tripRoute.DELETE, "DELETE", tripId, { password }),
  };
}

// A Trip together with a browser that has unlocked it.
export async function unlockedTrip(overrides: Record<string, unknown> = {}) {
  const tripId = await createdTripId(overrides);
  const emil = browser();
  await emil.unlock(tripId, String(overrides.password ?? californiaRoadTrip.password));
  return { tripId, emil };
}

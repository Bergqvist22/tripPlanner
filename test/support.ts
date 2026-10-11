import { sql } from "drizzle-orm";
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

import { createTrip, listTrips, parseNewTrip } from "@/lib/trips";

export async function GET() {
  return Response.json({ trips: await listTrips() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => undefined);
  const parsed = parseNewTrip(body);
  if ("errors" in parsed) return Response.json({ errors: parsed.errors }, { status: 400 });

  const trip = await createTrip(parsed.trip);
  return Response.json({ trip }, { status: 201 });
}

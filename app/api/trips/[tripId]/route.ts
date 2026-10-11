import { deleteTrip, openTrip } from "@/lib/access";
import { parseTripChanges, updateTrip } from "@/lib/trips";
import { refusedResponse, unlockFrom } from "./access";

export async function GET(request: Request, { params }: RouteContext<"/api/trips/[tripId]">) {
  const { tripId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);
  return Response.json({ trip: opened.trip });
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/trips/[tripId]">) {
  const { tripId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);

  const parsed = parseTripChanges(await request.json().catch(() => undefined));
  if ("errors" in parsed) return Response.json({ errors: parsed.errors }, { status: 400 });

  return Response.json({ trip: await updateTrip(opened.trip, parsed.changes) });
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/trips/[tripId]">) {
  const { tripId } = await params;
  const body = await request.json().catch(() => undefined);
  const deleted = await deleteTrip(tripId, unlockFrom(request, tripId), body?.password);
  if ("refused" in deleted) return refusedResponse(deleted);
  return new Response(null, { status: 204 });
}

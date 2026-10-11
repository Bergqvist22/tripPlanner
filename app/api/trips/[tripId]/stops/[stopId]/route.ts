import { openTrip } from "@/lib/access";
import { deleteStop, findStop, parseStopChanges, updateStop } from "@/lib/stops";
import { refusedResponse, unlockFrom } from "../../access";

type Context = RouteContext<"/api/trips/[tripId]/stops/[stopId]">;

function noSuchStop() {
  return Response.json({ error: "This Stop does not exist." }, { status: 404 });
}

export async function GET(request: Request, { params }: Context) {
  const { tripId, stopId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);

  const stop = await findStop(opened.trip, stopId);
  return stop ? Response.json({ stop }) : noSuchStop();
}

export async function PATCH(request: Request, { params }: Context) {
  const { tripId, stopId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);

  const parsed = parseStopChanges(await request.json().catch(() => undefined));
  if ("errors" in parsed) return Response.json({ errors: parsed.errors }, { status: 400 });

  const updated = await updateStop(opened.trip, stopId, parsed.changes);
  if (!updated) return noSuchStop();
  if ("errors" in updated) return Response.json({ errors: updated.errors }, { status: 400 });
  return Response.json({ stop: updated.stop });
}

export async function DELETE(request: Request, { params }: Context) {
  const { tripId, stopId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);

  return (await deleteStop(opened.trip, stopId)) ? new Response(null, { status: 204 }) : noSuchStop();
}

import { openTrip } from "@/lib/access";
import { addStop, listStops, parseNewStop } from "@/lib/stops";
import { refusedResponse, unlockFrom } from "../access";

export async function GET(request: Request, { params }: RouteContext<"/api/trips/[tripId]/stops">) {
  const { tripId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);
  return Response.json({ stops: await listStops(opened.trip) });
}

export async function POST(request: Request, { params }: RouteContext<"/api/trips/[tripId]/stops">) {
  const { tripId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);

  const parsed = parseNewStop(await request.json().catch(() => undefined));
  if ("errors" in parsed) return Response.json({ errors: parsed.errors }, { status: 400 });

  return Response.json({ stop: await addStop(opened.trip, parsed.stop) }, { status: 201 });
}

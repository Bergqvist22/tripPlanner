import { openTrip } from "@/lib/access";
import { listItems } from "@/lib/items";
import { listStops } from "@/lib/stops";
import { warningsOf } from "@/lib/warnings";
import { refusedResponse, unlockFrom } from "../access";

export async function GET(request: Request, { params }: RouteContext<"/api/trips/[tripId]/warnings">) {
  const { tripId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);
  const { trip } = opened;
  const [stops, items] = await Promise.all([listStops(trip), listItems(trip)]);
  return Response.json({ warnings: warningsOf(stops, items) });
}

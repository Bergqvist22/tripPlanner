import { openTrip } from "@/lib/access";
import { legsOf } from "@/lib/legs";
import { routeOf } from "@/lib/route";
import { listStops } from "@/lib/stops";
import { refusedResponse, unlockFrom } from "../access";

export async function GET(request: Request, { params }: RouteContext<"/api/trips/[tripId]/map">) {
  const { tripId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);
  const stops = await listStops(opened.trip);
  return Response.json({ route: routeOf(stops, await legsOf(stops)) });
}

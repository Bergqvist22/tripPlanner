import { openTrip } from "@/lib/access";
import { legsOf, travelOf } from "@/lib/legs";
import { listStops } from "@/lib/stops";
import { refusedResponse, unlockFrom } from "../access";

export async function GET(request: Request, { params }: RouteContext<"/api/trips/[tripId]/legs">) {
  const { tripId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);
  return Response.json({ travel: travelOf(await legsOf(await listStops(opened.trip))) });
}

import { openTrip } from "@/lib/access";
import { dayByDay } from "@/lib/days";
import { listItems } from "@/lib/items";
import { refusedResponse, unlockFrom } from "../access";

// The Items for the whole Trip. Those of a Stop are listed with their Stop.
export async function GET(request: Request, { params }: RouteContext<"/api/trips/[tripId]/days">) {
  const { tripId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);
  const items = await listItems(opened.trip);
  return Response.json({ dayByDay: dayByDay(items.filter((item) => item.stopId === null)) });
}

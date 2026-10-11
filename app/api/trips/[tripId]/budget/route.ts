import { openTrip } from "@/lib/access";
import { budgetOf, conversionFor } from "@/lib/budget";
import { listItems } from "@/lib/items";
import { listStops } from "@/lib/stops";
import { refusedResponse, unlockFrom } from "../access";

export async function GET(request: Request, { params }: RouteContext<"/api/trips/[tripId]/budget">) {
  const { tripId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);
  const { trip } = opened;
  const [stops, items] = await Promise.all([listStops(trip), listItems(trip)]);
  return Response.json({ budget: budgetOf(trip, stops, items, await conversionFor(trip, items)) });
}

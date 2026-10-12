import { openTrip } from "@/lib/access";
import { closeUpOf } from "@/lib/close-up";
import { listItems } from "@/lib/items";
import { findStop } from "@/lib/stops";
import { refusedResponse, unlockFrom } from "../../../access";

export async function GET(request: Request, { params }: RouteContext<"/api/trips/[tripId]/stops/[stopId]/map">) {
  const { tripId, stopId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);
  const { trip } = opened;
  const [stop, items] = await Promise.all([findStop(trip, stopId), listItems(trip)]);
  if (!stop) return Response.json({ error: "This Stop does not exist." }, { status: 404 });
  return Response.json({ closeUp: closeUpOf(stop, items) });
}

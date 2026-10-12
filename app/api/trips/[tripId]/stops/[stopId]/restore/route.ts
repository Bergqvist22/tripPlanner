import { openTrip } from "@/lib/access";
import { restoreStop } from "@/lib/recently-deleted";
import { refusedResponse, unlockFrom } from "../../../access";

export async function POST(request: Request, { params }: RouteContext<"/api/trips/[tripId]/stops/[stopId]/restore">) {
  const { tripId, stopId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);

  const stop = await restoreStop(opened.trip, stopId);
  if (!stop) return Response.json({ error: "This Stop is not in Recently deleted." }, { status: 404 });
  return Response.json({ stop });
}

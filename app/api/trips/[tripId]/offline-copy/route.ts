import { openTrip } from "@/lib/access";
import { offlineCopyOf } from "@/lib/offline-copy";
import { refusedResponse, unlockFrom } from "../access";

export async function GET(request: Request, { params }: RouteContext<"/api/trips/[tripId]/offline-copy">) {
  const { tripId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);
  return Response.json({ copy: await offlineCopyOf(opened.trip) });
}

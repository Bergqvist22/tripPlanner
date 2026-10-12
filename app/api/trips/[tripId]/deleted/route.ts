import { openTrip } from "@/lib/access";
import { listRecentlyDeleted } from "@/lib/recently-deleted";
import { refusedResponse, unlockFrom } from "../access";

export async function GET(request: Request, { params }: RouteContext<"/api/trips/[tripId]/deleted">) {
  const { tripId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);
  return Response.json(await listRecentlyDeleted(opened.trip));
}

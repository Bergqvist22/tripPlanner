import { openTrip } from "@/lib/access";
import { restoreItem } from "@/lib/recently-deleted";
import { refusedResponse, unlockFrom } from "../../../access";

export async function POST(request: Request, { params }: RouteContext<"/api/trips/[tripId]/items/[itemId]/restore">) {
  const { tripId, itemId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);

  const item = await restoreItem(opened.trip, itemId);
  if (!item) return Response.json({ error: "This Item is not in Recently deleted." }, { status: 404 });
  return Response.json({ item });
}

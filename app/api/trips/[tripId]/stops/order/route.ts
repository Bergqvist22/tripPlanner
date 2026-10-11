import { openTrip } from "@/lib/access";
import { parseStopOrder, reorderStops } from "@/lib/stops";
import { refusedResponse, unlockFrom } from "../../access";

export async function PUT(request: Request, { params }: RouteContext<"/api/trips/[tripId]/stops/order">) {
  const { tripId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);

  const order = parseStopOrder(await request.json().catch(() => undefined));
  if (!order) return Response.json({ error: "Give the Stops in their new order." }, { status: 400 });

  const stops = await reorderStops(opened.trip, order.stopIds);
  if (!stops) {
    return Response.json(
      { error: "The Stops have changed since you loaded them. Try again with the Stops shown now." },
      { status: 409 },
    );
  }
  return Response.json({ stops });
}

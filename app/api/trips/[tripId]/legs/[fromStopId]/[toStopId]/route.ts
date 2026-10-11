import { openTrip } from "@/lib/access";
import { parseLegChanges, updateLeg } from "@/lib/legs";
import { refusedResponse, unlockFrom } from "../../../access";

type Context = RouteContext<"/api/trips/[tripId]/legs/[fromStopId]/[toStopId]">;

export async function PATCH(request: Request, { params }: Context) {
  const { tripId, fromStopId, toStopId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);

  const parsed = parseLegChanges(await request.json().catch(() => undefined));
  if ("errors" in parsed) return Response.json({ errors: parsed.errors }, { status: 400 });

  const leg = await updateLeg(opened.trip, fromStopId, toStopId, parsed.changes);
  if (!leg) {
    return Response.json({ error: "These two Stops are no longer next to each other on the Route." }, { status: 404 });
  }
  return Response.json({ leg });
}

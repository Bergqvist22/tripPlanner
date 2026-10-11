import { openTrip } from "@/lib/access";
import { addItem, listItems, parseNewItem } from "@/lib/items";
import { refusedResponse, unlockFrom } from "../access";

export async function GET(request: Request, { params }: RouteContext<"/api/trips/[tripId]/items">) {
  const { tripId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);
  return Response.json({ items: await listItems(opened.trip) });
}

export async function POST(request: Request, { params }: RouteContext<"/api/trips/[tripId]/items">) {
  const { tripId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);

  const parsed = parseNewItem(await request.json().catch(() => undefined));
  if ("errors" in parsed) return Response.json({ errors: parsed.errors }, { status: 400 });

  const added = await addItem(opened.trip, parsed.item);
  if ("errors" in added) return Response.json({ errors: added.errors }, { status: 400 });
  return Response.json({ item: added.item }, { status: 201 });
}

import { openTrip } from "@/lib/access";
import { deleteItem, findItem, parseItemChanges, updateItem } from "@/lib/items";
import { refusedResponse, unlockFrom } from "../../access";

type Context = RouteContext<"/api/trips/[tripId]/items/[itemId]">;

function noSuchItem() {
  return Response.json({ error: "This Item does not exist." }, { status: 404 });
}

export async function GET(request: Request, { params }: Context) {
  const { tripId, itemId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);

  const item = await findItem(opened.trip, itemId);
  return item ? Response.json({ item }) : noSuchItem();
}

export async function PATCH(request: Request, { params }: Context) {
  const { tripId, itemId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);

  const parsed = parseItemChanges(await request.json().catch(() => undefined));
  if ("errors" in parsed) return Response.json({ errors: parsed.errors }, { status: 400 });

  const updated = await updateItem(opened.trip, itemId, parsed.changes);
  if (!updated) return noSuchItem();
  if ("errors" in updated) return Response.json({ errors: updated.errors }, { status: 400 });
  return Response.json({ item: updated.item });
}

export async function DELETE(request: Request, { params }: Context) {
  const { tripId, itemId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);

  return (await deleteItem(opened.trip, itemId)) ? new Response(null, { status: 204 }) : noSuchItem();
}

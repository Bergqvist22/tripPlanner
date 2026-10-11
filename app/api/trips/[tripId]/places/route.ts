import { openTrip } from "@/lib/access";
import { findPlaces, LONGEST_PLACE_QUERY } from "@/lib/place-search";
import { refusedResponse, unlockFrom } from "../access";

// Place search is asked here, never from the browser, and only for a Trip
// that has been unlocked, so the service is not open to anyone passing by.
export async function GET(request: Request, { params }: RouteContext<"/api/trips/[tripId]/places">) {
  const { tripId } = await params;
  const opened = await openTrip(tripId, unlockFrom(request, tripId));
  if ("refused" in opened) return refusedResponse(opened);

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length > LONGEST_PLACE_QUERY) {
    return Response.json(
      { error: `Search for at most ${LONGEST_PLACE_QUERY} characters.` },
      { status: 400 },
    );
  }

  const places = await findPlaces(query);
  if (!places) {
    return Response.json({ error: "Place search is not available right now. Try again in a moment." }, { status: 502 });
  }
  return Response.json({ places });
}

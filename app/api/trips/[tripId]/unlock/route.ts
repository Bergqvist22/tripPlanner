import { unlockTrip } from "@/lib/access";
import { refusedResponse } from "../access";

export async function POST(request: Request, { params }: RouteContext<"/api/trips/[tripId]/unlock">) {
  const { tripId } = await params;
  const body = await request.json().catch(() => undefined);
  const unlocked = await unlockTrip(tripId, body?.password);
  if ("refused" in unlocked) return refusedResponse(unlocked);
  return Response.json({ unlocked: true }, { headers: { "set-cookie": unlocked.unlockCookie } });
}

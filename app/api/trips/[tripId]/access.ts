import { unlockCookieName, type Refusal, type Refused } from "@/lib/access";

const refusals: Record<Refusal, { status: number; error: string }> = {
  "not-found": { status: 404, error: "This Trip does not exist." },
  locked: { status: 401, error: "Unlock this Trip with its Trip password first." },
  "wrong-password": { status: 403, error: "That is not the Trip password. Try again." },
  "too-many-attempts": { status: 429, error: "Too many wrong Trip passwords." },
};

export function refusedResponse({ refused, retryAfterSeconds }: Refused) {
  const { status, error } = refusals[refused];
  if (retryAfterSeconds === undefined) return Response.json({ error }, { status });
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return Response.json(
    { error: `${error} Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.` },
    { status, headers: { "retry-after": String(retryAfterSeconds) } },
  );
}

// The unlock the request's browser holds for the Trip, if any.
export function unlockFrom(request: Request, tripId: string) {
  const name = unlockCookieName(tripId);
  const cookies = (request.headers.get("cookie") ?? "").split(";").map((cookie) => cookie.trim().split("="));
  return cookies.find(([cookie]) => cookie === name)?.[1];
}

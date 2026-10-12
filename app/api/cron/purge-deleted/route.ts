import { purgeDeleted } from "@/lib/recently-deleted";

// Run once a day by the scheduler (vercel.json), which sends the CRON_SECRET
// it was given. Without one set, the job runs for nobody.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "This is for the scheduler." }, { status: 401 });
  }
  return Response.json({ purged: await purgeDeleted() });
}

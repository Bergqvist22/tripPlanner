import { z } from "zod";

type Point = { latitude: number; longitude: number };

// A drive between two points: how long it takes, how far it is, and the road
// it follows as points of latitude and longitude.
const driveSchema = z.object({
  durationSeconds: z.number().min(0),
  distanceMeters: z.number().min(0),
  road: z.array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)])).min(2),
});

export type Drive = z.infer<typeof driveSchema>;

// The adapter in front of the route-calculation service. Null when no road
// joins the two points. It rejects when the service cannot be reached or does
// not answer with a drive.
export type RouteCalculation = (from: Point, to: Point) => Promise<Drive | null>;

// The OSRM demo server: free, without a key, on OpenStreetMap data.
const OSRM_URL = "https://router.project-osrm.org";

const osrmSchema = z.object({
  routes: z
    .array(
      z.object({
        duration: z.number(),
        distance: z.number(),
        geometry: z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])) }),
      }),
    )
    .min(1),
});

// A road is kept as at most this many points: enough to follow it on a map of
// the whole Trip, without a long drive weighing thousands of points.
const MOST_ROAD_POINTS = 300;

function thinned<Position>(road: Position[]) {
  const step = Math.ceil(road.length / MOST_ROAD_POINTS);
  if (step <= 1) return road;
  const kept = road.filter((_, index) => index % step === 0);
  // The road still ends where the drive does.
  if ((road.length - 1) % step !== 0) kept.push(road[road.length - 1]);
  return kept;
}

// ROUTE_CALCULATION_URL points it at another server answering in the same format.
const osrm: RouteCalculation = async (from, to) => {
  const points = [from, to].map(({ latitude, longitude }) => `${longitude},${latitude}`).join(";");
  const response = await fetch(
    `${process.env.ROUTE_CALCULATION_URL ?? OSRM_URL}/route/v1/driving/${points}?overview=full&geometries=geojson`,
    {
      cache: "no-store",
      // A Trip is not kept waiting for a service that is slow to answer.
      signal: AbortSignal.timeout(4000),
    },
  );
  const answer: unknown = await response.json();
  if (z.object({ code: z.literal("NoRoute") }).safeParse(answer).success) return null;
  if (!response.ok) throw new Error(`The route-calculation service answered ${response.status}`);
  const [{ duration, distance, geometry }] = osrmSchema.parse(answer).routes;
  return {
    durationSeconds: duration,
    distanceMeters: distance,
    road: thinned(geometry.coordinates).map(([longitude, latitude]) => [latitude, longitude] as [number, number]),
  };
};

let calculation = osrm;

// A service that failed is left alone for a while, so that a Trip is not kept
// waiting for it on every read.
const RETRY_AFTER_MS = 60 * 1000;
let failedAt: number | undefined;

// Puts another calculation in place of the service, for tests.
export function replaceRouteCalculation(replacement: RouteCalculation) {
  calculation = replacement;
  failedAt = undefined;
}

// The drive between two points, or null when no road joins them. Undefined
// when the service could not be asked, which leaves it to be asked again later.
export async function calculatedDrive(from: Point, to: Point): Promise<Drive | null | undefined> {
  if (failedAt !== undefined && Date.now() - failedAt < RETRY_AFTER_MS) return undefined;
  try {
    const drive = await calculation(from, to);
    failedAt = undefined;
    return drive && driveSchema.parse(drive);
  } catch {
    failedAt = Date.now();
    return undefined;
  }
}

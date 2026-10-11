import { z } from "zod";

// A point on the map, with the name the search gave it.
export const placeSchema = z.object({
  label: z.string().trim().min(1).max(300),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export type Place = z.infer<typeof placeSchema>;

// The adapter in front of the place-search service. It rejects when the
// service cannot be reached or does not answer with places.
export type PlaceSearch = (query: string) => Promise<Place[]>;

// Photon: free, without a key, on OpenStreetMap data, and it allows searching
// while typing.
const PHOTON_URL = "https://photon.komoot.io/api/";

const photonSchema = z.object({
  features: z.array(
    z.object({
      geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
      properties: z.record(z.string(), z.unknown()),
    }),
  ),
});

// PLACE_SEARCH_URL points it at another address serving the same format.
const photon: PlaceSearch = async (query) => {
  const url = new URL(process.env.PLACE_SEARCH_URL ?? PHOTON_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "5");
  url.searchParams.set("lang", "en");
  const response = await fetch(url, {
    cache: "no-store",
    // A traveller is not kept waiting for a service that is slow to answer.
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`The place-search service answered ${response.status}`);
  const { features } = photonSchema.parse(await response.json());
  return features.map(({ geometry, properties }) => {
    const [longitude, latitude] = geometry.coordinates;
    // From the place itself outwards, each name once: "Monterey, California, United States".
    const names = [properties.name, properties.city, properties.state, properties.country].filter(
      (name): name is string => typeof name === "string" && name.trim() !== "",
    );
    return { label: [...new Set(names)].join(", "), latitude, longitude };
  });
};

let search = photon;

// Puts another search in place of the service, for tests.
export function replacePlaceSearch(replacement: PlaceSearch) {
  search = replacement;
}

// A search is only worth making for this much.
export const SHORTEST_PLACE_QUERY = 2;
export const LONGEST_PLACE_QUERY = 200;

// The places found for what was typed. Undefined when the service could not
// be asked, which is never a reason to hold back a Stop: its place is optional.
export async function findPlaces(typed: string): Promise<Place[] | undefined> {
  const query = typed.trim();
  if (query.length < SHORTEST_PLACE_QUERY) return [];
  try {
    const found = await search(query);
    // What is not a point on the map is left out.
    return found.flatMap((place) => placeSchema.safeParse(place).data ?? []);
  } catch {
    return undefined;
  }
}

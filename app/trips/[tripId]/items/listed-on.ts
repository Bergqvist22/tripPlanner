// The page an Item is listed on: its Stop's, or the Trip's.
export function listedOn(tripId: string, stopId: string | null) {
  return stopId ? `/trips/${tripId}/stops/${stopId}` : `/trips/${tripId}`;
}

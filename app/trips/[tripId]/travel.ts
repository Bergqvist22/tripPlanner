// A travel time as travellers read it: "45 min", "2 h", "2 h 5 min".
export function travelTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

// A distance in whole kilometres, or in metres when it is shorter than one.
export function distance(meters: number) {
  return meters < 1000 ? `${meters} m` : `${Math.round(meters / 1000).toLocaleString("en-GB")} km`;
}

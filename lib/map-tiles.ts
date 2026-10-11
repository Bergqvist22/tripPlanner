// Where the map's background comes from. OpenStreetMap's own tiles: free,
// without a key, and enough for a handful of Trips. Another provider is a
// change to this file alone.
export const MAP_TILES = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
};

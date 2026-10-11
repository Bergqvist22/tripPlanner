import { createServer } from "node:http";

// Stands in for the place-search service while the browser tests run, in the
// format the real one answers in. It knows a few places in California, and is
// out of order for anyone searching for "nowhere".
const places = [
  { name: "San Francisco", state: "California", country: "United States", at: [-122.4193, 37.7793] },
  { name: "Monterey", state: "California", country: "United States", at: [-121.8947, 36.6002] },
  { name: "Los Angeles", state: "California", country: "United States", at: [-118.2428, 34.0537] },
];

const port = Number(process.argv[2]);

createServer((request, response) => {
  const query = (new URL(request.url ?? "/", "http://localhost").searchParams.get("q") ?? "").toLowerCase();
  if (query.includes("nowhere")) {
    response.writeHead(503).end();
    return;
  }
  const features = places
    .filter(({ name }) => query !== "" && name.toLowerCase().includes(query))
    .map(({ at, ...properties }) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: at },
      properties,
    }));
  response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ features }));
}).listen(port, "127.0.0.1");

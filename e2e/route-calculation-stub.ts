import { createServer } from "node:http";

// Stands in for the route-calculation service while the browser tests run, in
// the format the real one answers in. Every drive takes 2 h 5 min over 190 km,
// around one corner.
const port = Number(process.argv[2]);

createServer((request, response) => {
  const points = /\/route\/v1\/driving\/([^?]+)/.exec(request.url ?? "")?.[1];
  if (!points) {
    response.writeHead(400).end();
    return;
  }
  const [from, to] = points.split(";").map((point) => point.split(",").map(Number));
  const routes = [
    { duration: 7512.4, distance: 190_340.2, geometry: { type: "LineString", coordinates: [from, [to[0], from[1]], to] } },
  ];
  response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ code: "Ok", routes }));
}).listen(port, "127.0.0.1");

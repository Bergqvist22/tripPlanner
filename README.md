# tripPlanner

A web app for planning a trip together with the people you are travelling with. You lay out the route stop by stop, collect everything you might book (flights, rental car, accommodation, activities), decide what to go with, and see what it all costs.

It is built for a small group planning one or two trips, for example a California road trip, rather than as a public product.

> **Status:** in development. So far a traveller can create a Trip, with a Trip password or open to everyone without one, open it, change its details and delete it, and lay out its Route: add Stops, give them dates and notes, reorder them by dragging and delete them, and add Items to a Stop or to the whole Trip, edit them, move them and delete them, give each Item a Status to compare Suggestions and record what was decided, and see the Budget: what the Selected and Booked Items cost in total and per person, by Category, by Stop and by Status, with each Item converted from the currency it was priced in to the display currency at a daily exchange rate, and search for the place of a Stop to see the Route on an overview map, with a pin per Stop joined in order, and see how long each Leg between two Stops takes: a Drive is calculated and drawn along the road, any other travel mode takes a travel time entered by hand, and a calculated time can be overridden. Any Item can be given a place too, and each Stop has a close-up map with a pin per Item that has one, coloured by Category, with Suggestions dimmed and Rejected Items left out until they are shown. Any Item can be given a date and a time as well, and each Stop page, and the Trip page for the Items of the whole Trip, lists them day by day: in time order under their day, an Accommodation on its check-in day, and the rest as Unscheduled. The Trip warns about nights of a Stop that no Selected or Booked Accommodation covers, about two that cover the same night, and about one that falls outside the dates of its Stop. Deleted Stops and Items go to Recently deleted on the Trip page, where they can be restored for 30 days: a Stop comes back with the Items that were deleted with it, and an Item whose Stop is still deleted comes back on the Trip as a whole. After 30 days a daily job purges them. A Trip can be read where there is no connection: each time a page of a Trip that is open in the browser is loaded, the device keeps an offline copy of the Trip, and without a connection that copy is shown instead, marked as an offline copy with its age, to read but not to edit, until the connection returns and the Trip is loaded again.

## What it does

- **Home page** listing every Trip by name and creator. A Trip is opened with its own Trip password if it was given one, and by anyone if not; there are no accounts.
- **Route of Stops.** A Trip is an ordered list of Stops with arrival and departure dates. A Stop can have zero nights, for a lunch break along the way.
- **Items for everything else.** Flights, car rental, accommodation, activities, food, transport and anything else are all Items with a Category, a cost, a link, a booking reference and notes. Items sit on a Stop or on the Trip as a whole.
- **Suggestions and decisions.** Every Item has a Status: Suggestion, Selected, Booked or Rejected. You can add three hotels to a Stop, compare them and mark the one you choose.
- **Budget.** The sum of Selected and Booked Items, as a total and per person, by Category and by Stop. Each Item keeps its own currency and the Trip shows everything in one display currency.
- **Map.** An overview map draws the Route through all Stops, and each Stop has a close-up map of its Items. Driving time between Stops is calculated and can be overridden by hand.
- **Day by day.** Items can have a date and a time and are then listed under that day of their Stop; the rest are Unscheduled.
- **Shared editing.** Everyone with the Trip password can edit, or everyone at all when the Trip has none. Each Stop and Item is saved on its own, and the latest change wins.
- **Recently deleted.** Deleted Stops and Items can be restored for 30 days.
- **Mobile and desktop**, with the last loaded version of a Trip readable offline.

The whole app is in English.

## Build order

1. **Planning.** Home page, Trips, Stops, Items, Status and Budget.
2. **Map and trip readiness.** Place search, Route and driving times, warnings for nights without accommodation, close-up maps, day-by-day listing, Recently deleted and offline reading.

## Tech

Next.js and TypeScript, hosted on Vercel, with Postgres for storage (Drizzle ORM, SQL migrations in `db/migrations/`). Exchange rates come from [Frankfurter](https://frankfurter.dev), which is free and needs no key; they are fetched at most once a day and kept in the database, so the last known rates are used when the service cannot be reached. Places are searched for through [Photon](https://photon.komoot.io), from the server, and the map is drawn with [Leaflet](https://leafletjs.com) on [OpenStreetMap](https://www.openstreetmap.org/copyright) tiles; drives are calculated by the [OSRM](https://project-osrm.org) demo server, from the server too, and kept per pair of Stops. All four are free and need no key. Stops and Items deleted more than 30 days ago are purged once a day by a [Vercel cron job](https://vercel.com/docs/cron-jobs) calling `/api/cron/purge-deleted`.

Offline reading has three parts. A page of a Trip that is open in the browser fetches the Trip's offline copy (`/api/trips/{tripId}/offline-copy`) and keeps it in the browser's local storage, and keeps the offline reader (the static page `/offline` and the files it is built from) in the browser's cache. A small service worker (`public/sw.js`) answers a page of a Trip that cannot be reached with the offline reader, which shows the copy. Map tiles and writes are never kept: the reader has no maps and no forms.

## Development

Needs Node 24 and Docker.

```sh
npm install
cp .env.example .env.local   # points at the Postgres in docker-compose.yml
npm run db:up                # start Postgres in Docker
npm run db:migrate           # create or update the tables
npm run dev                  # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm test` | Starts Postgres in Docker, creates a fresh test database and runs the whole suite through the server API |
| `npm run test:e2e` | Runs the browser tests in `e2e/` with Playwright against a production build on port 3100, using the test database. First time: `npx playwright install chromium` |
| `npm run typecheck` | Type-checks the project |
| `npm run lint` | Lints the project |
| `npm run db:generate` | Writes a new migration after `db/schema.ts` has changed |

## Deployment

The app deploys to Vercel with a hosted Postgres database (Neon's free tier, see ADR 0001).

1. Import the repository as a project on Vercel.
2. Add a Postgres database to the project (Storage → Neon) or create one at neon.tech, and make sure the project has a `DATABASE_URL` environment variable holding its connection string.
3. Give the project a `CRON_SECRET` environment variable holding a long random string. Vercel sends it with the daily purge job; without it the job is refused and nothing is ever purged.
4. Deploy. `vercel.json` makes every build run `npm run db:migrate` before `next build`, so the tables are created and kept up to date by deploying.

Preview deployments run migrations too, so give them their own database (a Neon branch) or limit `DATABASE_URL` to the Production environment.

## Documentation

- [`CONTEXT.md`](./CONTEXT.md) defines the project's vocabulary (Trip, Stop, Leg, Item, Status, Budget and so on). Code and discussion use these terms.
- [`docs/adr/`](./docs/adr/) records the decisions that are hard to reverse:
  - [0001: Postgres, not Redis, for trip data](./docs/adr/0001-postgres-not-redis.md)
  - [0002: A password per Trip, not user accounts](./docs/adr/0002-trip-password-not-accounts.md)

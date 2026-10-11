# tripPlanner

A web app for planning a trip together with the people you are travelling with. You lay out the route stop by stop, collect everything you might book (flights, rental car, accommodation, activities), decide what to go with, and see what it all costs.

It is built for a small group planning one or two trips, for example a California road trip, rather than as a public product.

> **Status:** in development. So far a traveller can create a Trip, open it with its Trip password, change its details and delete it, and lay out its Route: add Stops, give them dates and notes, reorder them by dragging and delete them, and add Items to a Stop or to the whole Trip, edit them, move them and delete them, give each Item a Status to compare Suggestions and record what was decided, and see the Budget: what the Selected and Booked Items cost in total and per person, by Category, by Stop and by Status, with every cost counted as if it were in the display currency (conversion between currencies comes next). The rest of the list below is being built ticket by ticket.

## What it does

- **Home page** listing every Trip by name and creator. Each Trip is opened with its own Trip password; there are no accounts.
- **Route of Stops.** A Trip is an ordered list of Stops with arrival and departure dates. A Stop can have zero nights, for a lunch break along the way.
- **Items for everything else.** Flights, car rental, accommodation, activities, food, transport and anything else are all Items with a Category, a cost, a link, a booking reference and notes. Items sit on a Stop or on the Trip as a whole.
- **Suggestions and decisions.** Every Item has a Status: Suggestion, Selected, Booked or Rejected. You can add three hotels to a Stop, compare them and mark the one you choose.
- **Budget.** The sum of Selected and Booked Items, as a total and per person, by Category and by Stop. Each Item keeps its own currency and the Trip shows everything in one display currency.
- **Map.** An overview map draws the Route through all Stops, and each Stop has a close-up map of its Items. Driving time between Stops is calculated and can be overridden by hand.
- **Day by day.** Items can have a date and a time and are then listed under that day of their Stop; the rest are Unscheduled.
- **Shared editing.** Everyone with the Trip password can edit. Each Stop and Item is saved on its own, and the latest change wins.
- **Recently deleted.** Deleted Stops and Items can be restored for 30 days.
- **Mobile and desktop**, with the last loaded version of a Trip readable offline.

The whole app is in English.

## Build order

1. **Planning.** Home page, Trips, Stops, Items, Status and Budget.
2. **Map and trip readiness.** Place search, Route and driving times, warnings for nights without accommodation, close-up maps, day-by-day listing, Recently deleted and offline reading.

## Tech

Next.js and TypeScript, hosted on Vercel, with Postgres for storage (Drizzle ORM, SQL migrations in `db/migrations/`).

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
3. Deploy. `vercel.json` makes every build run `npm run db:migrate` before `next build`, so the tables are created and kept up to date by deploying.

Preview deployments run migrations too, so give them their own database (a Neon branch) or limit `DATABASE_URL` to the Production environment.

## Documentation

- [`CONTEXT.md`](./CONTEXT.md) defines the project's vocabulary (Trip, Stop, Leg, Item, Status, Budget and so on). Code and discussion use these terms.
- [`docs/adr/`](./docs/adr/) records the decisions that are hard to reverse:
  - [0001: Postgres, not Redis, for trip data](./docs/adr/0001-postgres-not-redis.md)
  - [0002: A password per Trip, not user accounts](./docs/adr/0002-trip-password-not-accounts.md)

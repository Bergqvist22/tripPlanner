# tripPlanner

A web app for planning a trip together with the people you are travelling with. You lay out the route stop by stop, collect everything you might book (flights, rental car, accommodation, activities), decide what to go with, and see what it all costs.

It is built for a small group planning one or two trips, for example a California road trip, rather than as a public product.

> **Status:** planning. The domain model and the main decisions are written down, but there is no application code yet.

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

Next.js and TypeScript, hosted on Vercel, with Postgres for storage.

## Documentation

- [`CONTEXT.md`](./CONTEXT.md) defines the project's vocabulary (Trip, Stop, Leg, Item, Status, Budget and so on). Code and discussion use these terms.
- [`docs/adr/`](./docs/adr/) records the decisions that are hard to reverse:
  - [0001: Postgres, not Redis, for trip data](./docs/adr/0001-postgres-not-redis.md)
  - [0002: A password per Trip, not user accounts](./docs/adr/0002-trip-password-not-accounts.md)

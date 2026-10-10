# Postgres, not Redis, for trip data

The sibling project speakingGame stores everything in Upstash Redis, and reusing that would have been the path of least resistance. We chose Postgres (free tier, e.g. Neon) instead, keeping Next.js, TypeScript and Vercel: the data is relational (Trip → Stops → Legs and Items), the Budget is an aggregate over Items filtered by Status, and concurrent edits are resolved as last-write-wins per Stop or Item, which is a plain row update in Postgres and hand-built bookkeeping in a key-value store.

## Considered Options

- **Upstash Redis, one document per Trip** — rejected: saving a whole Trip silently overwrites a fellow traveller's concurrent edit.
- **Upstash Redis, one key per Item** — rejected: relations, ordering and sums would all be maintained by hand.

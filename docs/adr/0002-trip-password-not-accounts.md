# A password per Trip, not user accounts

The planner is for one or two trips shared among a handful of travellers, so we deliberately have no accounts. The home page is open and lists every Trip by name and creator name; each Trip's contents sit behind a single shared Trip password set at creation, and anyone holding it can view, edit and delete everything in that Trip. The Trip password is optional: a Trip created without one is open to everyone who finds the site, to view, edit and delete.

## Consequences

- The app never knows who is looking, so nothing can be personal: no per-user budget, no "my trips", no edit attribution.
- There is no password recovery; a lost password has to be reset by whoever operates the database. Nor can a Trip password be added, changed or taken away from within the app.
- Trip names and creator names are public to anyone who finds the site.

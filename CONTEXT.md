# Trip Planner

A shared planner where a group of travellers builds a trip together: the route, what they might book, what they have booked, and what it all costs.

## Language

### Structure

**Trip**:
One journey being planned, made up of an ordered list of Stops plus Items that span the whole journey. Has a name, a creator name, a traveller count and a display currency.
_Avoid_: Destination, journey, plan

**Stop**:
A place on the Trip's route with an arrival and departure date, each with an optional time of day. A Stop may have zero nights (a lunch break along the way). The Stop owns its dates and times; Items under it do not define them.
_Avoid_: Destination, city, location, waypoint

**Place**:
The point on the map a Stop or an Item is at, with the label the place search gave it. It is optional on both: a Stop or an Item without one works everywhere except the map.
_Avoid_: Location, address, coordinates

**Leg**:
The stretch between two consecutive Stops, with a travel mode and a travel time. For the Drive mode the time is calculated; it can always be overridden by hand.
_Avoid_: Route, segment, transfer

**Route**:
The whole path through all of a Trip's Stops in order, as drawn on the overview map.

**Close-up map**:
The map on a Stop's page, with a pin for each of that Stop's Items that has a place. Pins are coloured by Category; Suggestions are dimmed and Rejected Items left out unless they are being shown. The overview map shows only Stops and the Route.

### Items

**Item**:
Anything that can be added to a Trip or a Stop: a flight, a rental car, a hotel, an activity, a parking fee. All Items share the same shape; the Category is a label, not a type.
_Avoid_: Booking, entry, option, alternative

**Category**:
The label on an Item: Flight, Car rental, Accommodation, Activity, Food, Transport or Other.
_Avoid_: Type, kind

**Accommodation**:
The one Category with extra requirements: check-in and check-out dates.
_Avoid_: Hotel, lodging, stay

**Status**:
Where an Item stands in the decision: Suggestion, Selected, Booked or Rejected. Each Item's Status is independent of every other Item's; competing Suggestions are not grouped.

**Suggestion**:
An Item someone has proposed but the group has not decided on.
_Avoid_: Option, alternative, candidate, draft

**Selected**:
An Item the group has decided on but not yet paid for or reserved.
_Avoid_: Chosen, picked, confirmed

**Booked**:
An Item that has actually been reserved or paid for.
_Avoid_: Confirmed, reserved

**Rejected**:
A Suggestion the group decided against, kept for reference rather than deleted.
_Avoid_: Dismissed, declined, archived

**Warning**:
Something about where the group sleeps that it will want to look at: a night of a Stop that no Selected or Booked Accommodation covers, two that cover the same night, or one whose dates fall outside its Stop's. Worked out whenever a Trip is read, never stored.
_Avoid_: Alert, error, conflict

**Unscheduled**:
An Item with no date. Items with a date are listed under that day of their Stop, or of the Trip when they are for the whole Trip, in time order with those without a time first; a time of day is optional on top, and alone it does not schedule an Item. An Accommodation is listed on its check-in day.
_Avoid_: Undated, backlog

**Recently deleted**:
Where a deleted Stop or Item stays, restorable, for 30 days before it is gone for good. Restoring a Stop brings back the Items that were deleted with it; an Item restored while its Stop is still deleted goes to the Trip as a whole.
_Avoid_: Trash, bin, archive

### Money

**Budget**:
The summed cost of a Trip's Selected and Booked Items, shown as a total and per person. It is a sum, not a spending limit.
_Avoid_: Limit, cap, allowance

**Display currency**:
The single currency a Trip's Budget is shown in. Each Item keeps the currency it was priced in.

**Exchange rate**:
What one currency is worth in another on a given day. The Budget converts each Item with the latest one known, so it moves from day to day; no rate is frozen when an Item is added.
_Avoid_: Conversion rate, FX

**Total / Per person**:
Whether an Item's cost covers the whole group (a hotel room) or one traveller (a flight ticket).

### Access

**Trip password**:
The single password that everyone travelling shares to view and edit a Trip. It is optional and can only be set when the Trip is created: a Trip without one is open to everyone. There are no accounts.
_Avoid_: Login, account, user

**Unlock**:
What a browser holds for a Trip after the Trip password has been given in it: the Trip stays open there across visits. A Trip that has a Trip password is locked in a browser without an unlock, and shows only its name and creator name. An unlock is for one Trip and identifies nobody.
_Avoid_: Session, login, sign in

**Creator name**:
The free-text name of whoever created a Trip, shown on the home page. It identifies nobody and grants nothing.
_Avoid_: Owner, user, author

**Offline copy**:
The last version of a Trip that a device loaded, unlocked if it has a Trip password, kept on that device and shown when there is no connection. It is for reading only, says how old it is, and is replaced each time the Trip is loaded again.
_Avoid_: Cache, snapshot, offline mode

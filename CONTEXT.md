# Trip Planner

A shared planner where a group of travellers builds a trip together: the route, what they might book, what they have booked, and what it all costs.

## Language

### Structure

**Trip**:
One journey being planned, made up of an ordered list of Stops plus Items that span the whole journey. Has a name, a creator name, a traveller count and a display currency.
_Avoid_: Destination, journey, plan

**Stop**:
A place on the Trip's route with an arrival and departure date. A Stop may have zero nights (a lunch break along the way). The Stop owns its dates; Items under it do not define them.
_Avoid_: Destination, city, location, waypoint

**Place**:
The point on the map a Stop is at, with the label the place search gave it. A Stop without one works everywhere except the map.
_Avoid_: Location, address, coordinates

**Leg**:
The stretch between two consecutive Stops, with a travel mode and a travel time. For the Drive mode the time is calculated; it can always be overridden by hand.
_Avoid_: Route, segment, transfer

**Route**:
The whole path through all of a Trip's Stops in order, as drawn on the map.

### Items

**Item**:
Anything that can be added to a Trip or a Stop: a flight, a rental car, a hotel, an activity, a parking fee. All Items share the same shape; the Category is a label, not a type.
_Avoid_: Booking, entry, option, alternative

**Category**:
The label on an Item: Flight, Car rental, Accommodation, Activity, Food, Transport or Other.
_Avoid_: Type, kind

**Accommodation**:
The one Category with extra requirements: a place plus check-in and check-out dates.
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

**Unscheduled**:
An Item with no date. Items with a date are listed under that day of their Stop; a time of day is optional on top.
_Avoid_: Undated, backlog

**Recently deleted**:
Where a deleted Stop or Item stays, restorable, for 30 days before it is gone for good.
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
The single password, set when a Trip is created, that everyone travelling shares to view and edit it. There are no accounts.
_Avoid_: Login, account, user

**Unlock**:
What a browser holds for a Trip after the Trip password has been given in it: the Trip stays open there across visits. A Trip without one is locked and shows only its name and creator name. An unlock is for one Trip and identifies nobody.
_Avoid_: Session, login, sign in

**Creator name**:
The free-text name of whoever created a Trip, shown on the home page. It identifies nobody and grants nothing.
_Avoid_: Owner, user, author

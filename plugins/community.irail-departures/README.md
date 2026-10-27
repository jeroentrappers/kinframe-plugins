# Train departures (Belgium)

The next trains from a Belgian station: time, destination, platform and the delay ("+3"), cancelled trains in red.
In the band it shrinks to the times and their delays. Data from the [iRail API](https://docs.irail.be/), refreshed
every minute.

## Setting it up

- **Station:** its name as the NMBS/SNCB writes it, in any of the country's languages ("Denderleeuw",
  "Brussel-Zuid", "Bruxelles-Midi").
- **Only trains towards** (optional): part of a destination's name ("Brussel", "Gent"); other trains are left out.
- **How many:** 1 to 5.

## What it may do

- **Internet:** `https://api.irail.be` only.

iRail is a free, community-run service; please keep the refresh at a minute or more.

Licence: Apache-2.0.

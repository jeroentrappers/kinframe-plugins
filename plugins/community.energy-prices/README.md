# Electricity price

Today's day-ahead electricity price per quarter hour, for dynamic tariffs: the price now in € per kWh with the
cheapest quarter hour still to come under it. Tap it for the whole day as bars, "now" marked and the cheapest quarter
hour picked out in green. Data from [Energy-Charts](https://www.energy-charts.info/) (Fraunhofer ISE), refreshed every
15 minutes.

## Setting it up

Pick your market zone: Belgium, the Netherlands, Germany and Luxembourg, France or Austria.

The price is the wholesale (EPEX day-ahead) price without taxes, network costs or your supplier's margin: a negative
price shows in green, above 15 c/kWh in amber.

## What it may do

- **Internet:** `https://api.energy-charts.info` only.
## Terms of the data

Energy-Charts publishes the day-ahead prices of the zones offered here under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) from Bundesnetzagentur | SMARD.de; prices of other zones are
for private use only, so they are not offered, and an answer that isn't published under CC BY 4.0 is never shown. The
detail card credits the source ("Data: Energy-Charts.info · Bundesnetzagentur | SMARD.de (CC BY 4.0)"). The plugin asks
at most every 15 minutes (the prices change once a day) and reports a `429 Too Many Requests` as such.

Licence: Apache-2.0. Data: Energy-Charts (CC BY 4.0), Bundesnetzagentur | SMARD.de.

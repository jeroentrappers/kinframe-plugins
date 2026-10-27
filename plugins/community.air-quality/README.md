# Air quality

The European Air Quality Index (EAQI) and fine dust (PM2.5) where you live, as a ring: green while the air is good or
fair, amber when it is moderate or poor, red when it is very poor or worse. Data from
[Open-Meteo's air quality API](https://open-meteo.com/en/docs/air-quality-api) (CAMS), refreshed every 30 minutes.

## Setting it up

Nothing to fill in: the plugin uses the frame's own place (from its weather settings), rounded to about a kilometre.
To show somewhere else, type a latitude and longitude.

## What it may do

- **Internet:** `https://air-quality-api.open-meteo.com` only.
- **Location:** reads the frame's place (two decimals, about 1 km), to ask for the air quality there.

## Levels

| EAQI | Shown as | Tone |
|---|---|---|
| 0–20 | Good | good |
| 20–40 | Fair | good |
| 40–60 | Moderate | warn |
| 60–80 | Poor | warn |
| 80–100 | Very poor | bad |
| above 100 | Extremely poor | bad (ring full) |

Licence: Apache-2.0. Data: Open-Meteo (CC BY 4.0), Copernicus Atmosphere Monitoring Service.

# Stock ticker

Up to five shares, indices, currencies or cryptocurrencies, each with its price and today's change: green with an
arrow up, red with an arrow down. In the band it shrinks to the names and their changes; tap it for the change in the
price's own unit as well. Data from [EODHD](https://eodhd.com/) with your own API key: Euronext (Brussels, Amsterdam,
Paris, Lisbon), the US exchanges and most other exchanges, currency pairs and cryptocurrencies.

## Setting it up

1. Make an account at [eodhd.com](https://eodhd.com/) (the free plan works) and copy your API key from its settings.
2. Fill in the key and the symbols, separated by commas, as EODHD writes them: `CODE.EXCHANGE`.

| | Example |
|---|---|
| Euronext Brussels, Amsterdam, Paris | `UCB.BR`, `ASML.AS`, `AIR.PA` |
| US shares and funds | `AAPL.US`, `VTI.US` |
| Indices | `GSPC.INDX` (S&P 500) |
| Currencies | `EURUSD.FOREX` (shown as EUR/USD) |
| Cryptocurrencies | `BTC-USD.CC` (shown as BTC) |

Add `=Name` to choose the name shown (at most 10 characters): `GSPC.INDX=S&P 500`. Look up a code with EODHD's
search on their site.

3. Set **API calls per day** to your plan's daily limit (20 on the free plan).

## How often it refreshes

Every symbol costs one API call per refresh, so the plugin spreads your plan's calls evenly between 9:00 and 22:00
(the frame's time: the trading hours of Europe and America), at most every 15 minutes, and counts them so a restart
doesn't spend them twice. On the free plan with five symbols that is four refreshes a day, about every 3¼ hours: a
snapshot, not a live ticker. With a paid plan, set its limit and it refreshes every 15 minutes. Shares are delayed
15–20 minutes by EODHD anyway. Nothing is asked at the weekend unless a cryptocurrency is in the list. When EODHD
says the day's calls are used up, the last quotes stay until the next day.

## What it may do

- **Internet:** `https://eodhd.com` only. Your key goes only there.

## Terms of the data

EODHD's personal plans are for private, non-commercial use, and the key is yours: it is set up by you, for your own
frame, and never leaves it except to EODHD. Don't share your key or your frame's plugin settings with others. The
detail card credits the source and the delay ("Data: EODHD · 15–20 min delayed"). Prices are for information,
not for trading.

Licence: Apache-2.0. Data: EODHD.

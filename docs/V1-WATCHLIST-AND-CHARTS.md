# Piecebook — V1 Watchlist + price history (Design addendum)
As of: 5 Sep 2026 SGT  
Owner: Design  
For: Code (implement)  
Amends: `V1-DESIGN-PACK.md` § Card detail ("No charts"), § Collection, § TabBar (still three tabs)

Recreated in-repo from Jib's request ("Watchlist (star cards/sets you care about)", "Charts (price over time from dated seed points)").

## Watchlist
- Star a **card** from card detail or a **set** from set detail: one quiet ink `StarButton` (44px, outline off / filled on, `aria-pressed`) at the right of the BackBar. Never the accent; watching is not the primary action.
- Markers: a small filled star on a watched card's art (top-left; the owned check stays top-right) and beside the chevron on a watched SetTile.
- **Collection** gets a **Watching** section above owned cards: starred sets as compact rows (code · name · card count), starred cards as the usual grid. When both Watching and owned exist, the owned grid gets an **Owned** heading. Nothing watched → no section. No fourth tab.
- Storage: `localStorage` key `piecebook.watchlist.v1`, `{ cards: { [cardNumber]: { at } }, sets: { [setCode]: { at } } }`, newest first. Separate from `piecebook.v1` so neither store's migration touches the other. No accounts, no alerts.

## Price history
- Data: `data/price-history/{code}.csv` (`card_number,as_of,market_usd`), one row per card per day, appended by `npm run seed:refresh`. Seed prices only; there is still no live feed.
- Card detail, under Market (seed): with **two or more** dated points, a `PriceChart` — one ink line, end dots, first / last date beneath, low / high at the right. No axes, fills, % change or sparklines elsewhere. With **one** point: `1 dated point · history builds with each seed refresh`. Cards without a seed price show nothing extra.
- Loaded lazily per set on card detail only; the main bundle does not carry history.
- Box (sealed) prices are not charted: the roster holds one dated point per set and is Cards' file.

## Out of scope
Alerts, live prices, charts on cells / tiles / Portfolio, FX conversion.

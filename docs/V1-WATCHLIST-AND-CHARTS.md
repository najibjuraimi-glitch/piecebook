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
- Data: `data/price-history/{code}.csv` (`card_number,as_of,market_usd,source`), one row per card per day. `source=limitless` rows are appended by `npm run seed:refresh` (daily); `source=tcgplayer` rows are the one-off weekly backfill from TCGPlayer's chart data (`npm run seed:backfill`). Seed prices only; there is still no live feed.
- Card detail, under Market (seed): with **two or more** dated points, a `PriceChart` — one ink line, dots on every point while sparse and only the end dots once dense, first / last date beneath, low / high at the right, then range chips **1M · 3M · 6M · 1Y · All** (text chips, ink when selected; a chip is dropped when its window would show the same points as the next wider one) and one muted provenance line (`Weekly points from TCGPlayer chart data; daily points read from Limitless. Seed, not live.`). No axes, fills, % change or sparklines elsewhere. With **one** point: `Tracked since 5 Sep 2026 · 1 dated point so far`. Cards without a seed price show nothing extra.
- Loaded lazily per set on card detail only; the main bundle does not carry history.
- Box (sealed) prices are not charted yet: since 5 Sep 2026 the daily feed appends one dated point per box (`data/box-price-history.csv`), so a box line becomes possible once points accumulate; see the 3.2 addendum.
- One point reads `Tracked since 5 Sep 2026 · 1 dated point so far`, so a new collector sees why the line is missing rather than a bare date.

## Where history comes from, and why ours starts on 4 Sep 2026
- Piecebook records a seed price per card per day (`npm run seed:refresh`, daily via the **Seed refresh** workflow). Every point in `data/price-history/` was recorded by us; the first run was 4 Sep 2026. Nothing before that exists in our data.
- **Collectr** (the reference Jib likes for chart UX) values cards "daily from real sales data" aggregated from TCGPlayer, eBay and Cardmarket, and sells "up to 5+ years of history" behind PRO. That history is theirs because they have snapshotted daily for years under partner / affiliate data access; their third-party API exposes only ~30 recent snapshots per product.
- **PriceCharting** monitors every eBay sale, assigns it to a card with its own algorithm and charts the end-of-month price. Its official API and CSVs return current values only: "Historic prices and historic sales are not supported."
- **Limitless** (our source) shows current TCGPlayer market only; the Wayback Machine holds a single snapshot of its OP-09 page, so archives cannot backfill.
- **TCGPlayer** product pages draw their chart from an undocumented endpoint that returns 52 weekly market-price buckets per product, unauthenticated, and Limitless already exposes the TCGPlayer product ID for every print (`data/tcgplayer-products.csv`, written by the refresh). It is not a published API and TCGPlayer's terms restrict automated access. **Decision (Jib, 5 Sep 2026): use it once** as a backfill (`npm run seed:backfill`: English / Near Mint SKU, buckets with no market price skipped, existing Limitless days left alone, `source=tcgplayer`), then let the daily Limitless refresh carry forward. The workflow never calls TCGPlayer.
- Range chips (1M · 3M · 6M · 1Y · All) are on now that every priced card has a year of weekly points. Graded and population views are out of scope: Piecebook has no grading data.

## What we borrow from Collectr, and what we don't
Borrow: the card page hierarchy (identity → price → chart → own), range chips later, a watch star. Don't: dark theme, the Raw / Graded / Pop tabs, sold-listings buttons, shop rows and affiliate carts, per-cent-change badges. Paper, ink, one accent.

## Out of scope
Alerts, live prices, charts on cells / tiles / Portfolio, FX conversion.

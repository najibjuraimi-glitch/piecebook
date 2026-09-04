# Piecebook — V1 SetTile sealed prices + quiet grid market USD (Design addendum)
As of: 4 Sep 2026 SGT  
Owner: Design  
For: Code (implement), Cards (data)  
Amends: `V1-DESIGN-PACK.md` § Components (SetTile, SealedStrip, CardCell) and § Set detail “Do not: inline prices on every cell”

## Why
Collectors want to see what a sealed EN box goes for in SG, and the seed market figure on a card, without leaving the calm set browser. Show both quietly. Do not become a marketplace: no buy / cart / seller chrome, no % change, no sparklines.

## Sealed seed (Cards)
`data/sealed-seed.json`, one row per set × language × product. Fields:

| Field | Meaning |
| --- | --- |
| `setCode`, `setName`, `language`, `product` | Which box (`booster_box`) feeds which set |
| `boxArtUrl` | Closed EN booster box front, supplied and cleared by Cards / Design (retailer watermark acceptable in V1). `null` if none |
| `sgAskSgd`, `sgSource` | SG clean-box ask in SGD and where it was read |
| `usMarketUsd`, `usSource` | TCGPlayer market in USD and product reference |
| `asOf` | ISO date the prices were read |

Design and Code do not invent prices or art. Only URLs Cards supplies and Design clears as closed box fronts go into `boxArtUrl` (pack / open-carton promo shots are not box fronts).

## SetTile
Quiet surface card. Whole tile taps to the set.
- Art band on top: box art when `boxArtUrl` is set, `object-fit: cover` so the box face fills the band. Type-first (big OP code on tinted paper) only when there is no URL or the image fails to load.
- Body: EN set meta, set code, set name, card count, then the sealed price:
  - Primary: `Box · S$750` (SG ask; the meta line above already says EN, so the language is not repeated)
  - Secondary, muted: `US $669.52 · as of 4 Sep 2026`
- No buy / cart / seller chrome.

## SealedStrip (set detail)
Keep the EN / JP guidance lines. Add the same primary / secondary price row under them, as `EN box · S$750` (the strip also lists JP, so the price says which box). State the language once per line: the EN / JP badge carries it, so guidance copy reads `Box feeds this set · …`, not `EN box feeds…`.

## CardCell (set grid, collection)
Under name + rarity, one muted `$12.50` from the seed `market_usd`. Omit the line when the value is missing. No `as_of` on cells, no % change, no sparklines. Art stays first.

## Out of scope
Live prices, new sets, marketplace links, inventing `boxArtUrl`.

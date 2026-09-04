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
| `boxArtUrl` | Booster box art. `null` for now; Cards fills later |
| `sgAskSgd`, `sgSource` | SG clean-box ask in SGD and where it was read |
| `usMarketUsd`, `usSource` | TCGPlayer market in USD and product reference |
| `asOf` | ISO date the prices were read |

Design and Code do not invent prices or art. `boxArtUrl` stays `null` until Cards supplies URLs; the field is wired so art appears without a code rewrite.

## SetTile
Quiet surface card. Whole tile taps to the set.
- Art band on top: box art when `boxArtUrl` is set; otherwise type-first (big OP code on tinted paper).
- Body: EN set meta, set code, set name, card count, then the sealed price:
  - Primary: `EN box · S$750` (SG ask)
  - Secondary, muted: `US $669.52 · as of 4 Sep 2026`
- No buy / cart / seller chrome.

## SealedStrip (set detail)
Keep the EN / JP guidance lines. Add the same primary / secondary price row under them.

## CardCell (set grid, collection)
Under name + rarity, one muted `$12.50` from the seed `market_usd`. Omit the line when the value is missing. No `as_of` on cells, no % change, no sparklines. Art stays first.

## Out of scope
Live prices, new sets, marketplace links, inventing `boxArtUrl`.

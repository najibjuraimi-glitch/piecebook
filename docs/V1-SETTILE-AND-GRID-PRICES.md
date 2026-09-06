# Piecebook — V1 SetTile sealed prices + quiet grid market USD (Design addendum)
As of: 4 Sep 2026 SGT  
Owner: Design  
For: Code (implement), Cards (data)  
Amends: `V1-DESIGN-PACK.md` § Components (SetTile, SealedStrip, CardCell) and § Set detail “Do not: inline prices on every cell”

## Why
Collectors want to see what a sealed EN box goes for in SG, and the seed market figure on a card, without leaving the calm set browser. Show both quietly. Do not become a marketplace: no buy / cart / seller chrome, no % change, no sparklines.

## Sealed seed (Cards)
Sealed prices live on the roster rows of `data/sets-roster-en.json` (`sealed-seed.json` was folded into it on 5 Sep 2026). Fields:

| Field | Meaning |
| --- | --- |
| `setCode`, `setName`, `language`, `product` | Which box (`booster_box`) feeds which set |
| `boxArtUrl` | Closed EN booster box front on white, supplied and cleared by Cards / Design. Vendored in the repo under `public/box-art/` and referenced by local path (`/box-art/op09-en-white.jpg`), never hotlinked. `null` if none |
| `sgAskSgd`, `sgSource` | SG clean-box ask in SGD and where it was read |
| `usMarketUsd`, `usSource` | TCGPlayer market in USD and product reference |
| `asOf` | ISO date the prices were read |

Design and Code do not invent prices or art. Only URLs Cards supplies and Design clears as closed box fronts go into `boxArtUrl` (pack / open-carton promo shots are not box fronts).

## SetTile
Quiet surface card. Whole tile taps to the set.
- Art band on top (3:2): box art when `boxArtUrl` is set, `object-fit: cover; object-position: center` so the box face fills the band. Vendored fronts are pre-framed to 3:2 so lightbox walls and floor sit outside the frame. Type-first (big OP code on tinted paper) only when there is no URL or the image fails to load.
- Body: EN set meta, set code, set name, card count, then the sealed price:
  - Primary: `Box · S$750` (SG ask; the meta line above already says EN, so the language is not repeated)
  - Secondary, muted: `US $669.52 · as of 4 Sep 2026`
- No buy / cart / seller chrome.

## SealedStrip (set detail)
Keep the EN / JP guidance lines. Add the same primary / secondary price row under them, as `EN box · S$750` (the strip also lists JP, so the price says which box). State the language once per line: the EN / JP badge carries it, so guidance copy reads `Box feeds this set · …`, not `EN box feeds…`.

## CardCell (set grid, collection)
Under name + rarity, the seed `market_usd` in ink at body size (`$12.50`), omitted when missing. Art stays first. No `as_of` on cells, no sparklines, no buy / qty / plus chrome.

**Set-detail singles (Jib, 6 Sep 2026).** Under the price, the week seed-price move from the same history the card page uses: `−$15.99 (−5.54%)` in ink (not red or green). The percent is the dollar move over the reference price, two decimals, unicode minus. Omitted when the set’s history has fewer than two dated points. Collection and search cells keep the price without that line.

## Out of scope
Live prices, new sets, marketplace links, inventing `boxArtUrl`.

# Piecebook — V1 full EN Sets roster (Design addendum)
As of: 4 Sep 2026 SGT  
Owner: Design  
For: Code (implement), Cards (data)  
Amends: `V1-DESIGN-PACK.md` § Sets, § Set detail; `V1-SETTILE-AND-GRID-PRICES.md` § SetTile  
Companion: `V1-COST-AND-PORTFOLIO-UI.md`

Recreated in-repo from the implementation brief; wording follows the brief, nothing added.

## Why
Sets home should show every EN booster set a collector might own, not only the two whose checklists are seeded. A set with no checklist yet still gets a tile and a quiet detail page. Nothing is invented to fill the gap.

## Roster (Cards)
`data/sets-roster-en.json` is one object `{ asOf, note, sets: [...] }`: file-level `asOf` 2026-09-04, a one-line `note` on what the file covers, and 23 rows in `sets`: OP-01 … OP-17, EB-01 … EB-04, PRB-01 … PRB-02.

| Field (per row) | Meaning |
| --- | --- |
| `setCode`, `setName`, `language`, `product` | Which set and which sealed product the prices describe; `language` is `EN` and `product` is `booster_box` throughout |
| `enReleased` | ISO EN release date; drives tile order |
| `cardSeedStatus` | `ready` when the card CSV is in the repo, `pending` otherwise |
| `sgAskSgd`, `usMarketUsd` | EN booster box SG ask / US market, or `null` |
| `asOf`, `usSource`, `priceNote` | Per-row price date, TCGPlayer product URL the US figure was read from (provenance, not rendered), optional caveat |
| `boxArtUrl` | Local path under `public/box-art/`, or `null`. Cards writes `vendored` for a set whose front is already in the repo (OP-09 → `/box-art/op09-en-white.jpg`). Anything else is treated as no art; nothing is hotlinked |

Key rows (Cards' verified roster, 4 Sep 2026):
- **All 22 sets**: `usMarketUsd` filled, `asOf` `2026-09-04`, `usSource` set.
- **OP-09** `ready`: `sgAskSgd` 750, `usMarketUsd` 669.52, art vendored.
- **OP-16** `ready`: `sgAskSgd` 295, `usMarketUsd` 207.42, `boxArtUrl` `null`.
- **Every other set**: `sgAskSgd` `null` (no verified SG ask; never derived from USD), `boxArtUrl` `null`.
- **Checklists (5 Sep 2026)**: all 23 rows are `ready` (EB-04 added: no EN box, prices null, `priceNote` explains); one `data/{code}-en-seed.csv` per set. Regular sets keep same-set rows only; PRB reprint sets list every print in the box and a card can belong to its home set and a PRB checklist at once. See `seed-sources.md`.

Code and Design do not invent prices, art or intro copy. The roster wins membership: a set is on Sets home iff it is on the roster.

## Sets home
- Subline **EN sets** (was “EN booster boxes” until EB-04, which has no EN box, joined the roster on 5 Sep 2026).
- Tiles ordered by `enReleased` ascending.
- Tile per row: art band (box art when `boxArtUrl` resolves, otherwise type-first big code), `EN set · OP-01`, set name, then:
  - `ready` → `{n} cards in seed` and the sealed price block.
  - `pending` → **Checklist soon**, then the sealed price block. Omitted only when both prices are `null`.
- Price block:
  - `sgAskSgd` present → primary `Box · S$750`, muted secondary `US $669.52 · as of 4 Sep 2026`.
  - `usMarketUsd` only → one quiet line `Box · US $1,468.78 · as of 4 Sep 2026`. No SGD is invented.
  - both `null` → no price line.

## Set detail
- **Seeded checklist (all 23 sets)** — unchanged depth from PR #5: SealedStrip (EN / JP box lines derived from the intro dates and JP title, box price from the roster), SetIntro (EN / JP dates, JP title, Bandai card-types count; theme line where Cards wrote one), SearchField, sort, All-first RarityTabs, grid.
- **Pending checklist** — BackBar (code + name); SealedStrip only if it has something to say (guidance or a price); SetIntro if Cards wrote one, else an optional `EN · D MMM YYYY` line from the roster only; **no search, sort or rarity tabs**; then one empty panel:
  - **Checklist not seeded yet**
  - “Card list for this set is coming. Sealed notes above still apply.”
- **Unknown code** — **Set not found** + Browse sets → `/`.

## Out of scope
Live prices, inventing checklists / art / intros, affiliate or marketplace links.

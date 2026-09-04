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
`data/sets-roster-en.json`, one row per EN set. 22 rows: OP-01 … OP-17, EB-01 … EB-03, PRB-01 … PRB-02. `asOf` 2026-09-04.

| Field | Meaning |
| --- | --- |
| `setCode`, `setName`, `language` | Which set; `language` is `EN` throughout |
| `enReleased` | ISO EN release date; drives tile order |
| `cardSeedStatus` | `ready` when the card CSV is in the repo, `pending` otherwise |
| `sgAskSgd`, `usMarketUsd` | EN booster box SG ask / US market, or `null` |
| `boxArtUrl` | Local path under `public/box-art/`, or `null`. Cards may write `vendored` for a set whose front is already in the repo (OP-09 → `/box-art/op09-en-white.jpg`). Anything else is treated as no art; nothing is hotlinked |
| `asOf` | Date the row was read |

Key rows:
- **Most sets**: `pending`, prices `null`, `boxArtUrl` `null`.
- **OP-09** `ready`: `sgAskSgd` 750, `usMarketUsd` 669.52, art vendored.
- **OP-16** `ready`: `sgAskSgd` 295, `usMarketUsd` 207.42, `boxArtUrl` `null`.

Code and Design do not invent prices, art or intro copy. The roster wins membership: a set is on Sets home iff it is on the roster.

## Sets home
- Subline **EN booster boxes**.
- Tiles ordered by `enReleased` ascending.
- Tile per row: art band (box art when `boxArtUrl` resolves, otherwise type-first big code), `EN set · OP-01`, set name, then:
  - `ready` → `{n} cards in seed` and the sealed price block when a price exists.
  - `pending` → **Checklist soon**; price block omitted when prices are `null`.

## Set detail
- **Seeded checklist (OP-09, OP-16)** — unchanged depth from PR #5: SealedStrip, SetIntro, SearchField, sort, All-first RarityTabs, grid.
- **Pending checklist** — BackBar (code + name); SealedStrip only if it has something to say (guidance or a price); SetIntro if Cards wrote one, else an optional `EN · D MMM YYYY` line from the roster only; **no search, sort or rarity tabs**; then one empty panel:
  - **Checklist not seeded yet**
  - “Card list for this set is coming. Sealed notes above still apply.”
- **Unknown code** — **Set not found** + Browse sets → `/`.

## Out of scope
Live prices, inventing checklists / art / intros, affiliate or marketplace links.

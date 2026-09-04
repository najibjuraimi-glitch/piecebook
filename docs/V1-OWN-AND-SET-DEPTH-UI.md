# Piecebook — V1 Own + set-detail depth (Design addendum)
As of: 4 Sep 2026 SGT  
Owner: Design  
For: Code (implement), Cards (data)  
Amends: `V1-DESIGN-PACK.md` § Set detail, § Card detail, § Collection  
Companion: `V1-SET-DETAIL-CONTROLS.md` (search, sort, All tab)

Recreated in-repo from the implementation brief; wording follows the brief, nothing added.

## Why
Collectors want to find a card in a set quickly, understand what the set is, and mark what they own with one tap. Keep the browser calm: quiet chrome, one accent, no marketplace. Do not invent copy, prices, or dates.

## Tokens
paper `#F7F5F0` · surface `#FFFFFF` · ink `#1A1A1A` · muted `#6B6560` · line `#E6E1D8` · accent `#C45C26` **only on Mark owned**.

## Set intros (Cards)
`data/set-intros.json`, one row per set × language. Fields:

| Field | Meaning |
| --- | --- |
| `setCode`, `setName`, `language` | Which set the intro describes |
| `enReleased`, `jpReleased` | ISO release dates |
| `packsPerBox`, `cardsPerPack` | Box structure |
| `introTheme` | One sentence on what the set is about, written by Cards |
| `sources`, `asOf` | Where the facts were read and when |

Code and Design do not write intros. Any missing field is omitted from the UI, never guessed.

## Set detail stack (top → bottom)
1. **BackBar** — set code as title, set name as muted subline.
2. **SealedStrip** — prices kept; **no buy CTA**.
3. **SetIntro** — optional label “About this set”; `introTheme`; `EN · D MMM YYYY · JP · D MMM YYYY`; `{packs} packs · {cards} cards per pack`. Omit whatever is missing. Never invent.
4. **SearchField** — see companion doc.
5. **Controls** — sort select + `{n} cards`. See companion doc.
6. **Sticky RarityTabs** — **All** first and the default on open. Parallels still appear in All (and keep their own tab).
7. **CardGrid** — filtered ∩ searched ∩ sorted.

Empty search / filter copy: **“No cards match.”**

Only the RarityTabs are sticky. No second sticky toolbar.

## Thin Own
- Local only: `localStorage` owned flag + qty (default 1). **No cost, date or note UI.**
- **Card detail**: not owned → **Mark owned** (accent, full width, thumb zone). Owned → “Owned” + **Remove from collection** (ghost).
- **CardCell**: small check badge on the art when owned. No Mark button on cells; owning happens on detail only.
- **Collection**: count subline, grid of owned cells, newest first when timestamps exist else set + number, tap → detail. Empty: “No owned cards yet.” + Browse sets → `/`.
- **Portfolio** tab: leave the stub as is; no fake P/L.

## Out of scope
Cost basis, portfolio math, affiliate links, inventing intros, a second sticky toolbar.

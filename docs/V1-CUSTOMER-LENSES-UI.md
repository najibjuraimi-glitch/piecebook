# Piecebook V1 — Customer lenses (shop + learn)
(Design addendum, draft v2 after 40 seats then the same 40 on v1, 6 Sep 2026. Not approved. Not for merge.)

Owner: Code as interim Cards, from Jib’s 6 Sep instruction to review Collectr and Bandai how-to-play, then live Piecebook, 20 shop + 20 learn (10 new / 10 play each)  
For: Design (critique), the same 40 seats on v1, then Jib  
Covers: Start here doors, Sets jumps, Learn to play — a pass on Collect and Play **before the next phase**  
Reads with: `V1-DESIGN-PACK.md`, `V1-STARTER-DECKS-LINKS-LEARN-UI.md` (6.7), `V1-SETTILE-AND-GRID-PRICES.md`, `V1-BELONG-UI.md` (8.1), `seed-sources.md`

Not a shop. No cart. No World-only third wave — those 40 already saw the World tab. No 9.2.

## Why
The three pillars are up. Jib asked to look through shopper and learner eyes before opening the next phase. Collectr’s One Piece grid is a chase ticker (Price high to low, SAMPLE, Shop, +). Bandai’s how-to-play page is a funnel (video, boxes, official shop, app) and does not teach a turn. Piecebook already has the honest pieces (dated seed, five sentences, starter rows). The first door often missed them.

## What we will not do
- A cart, checkout, or buy button.
- Collectr chrome: % badges, +, SAMPLE, PRO price range, multi-TCG sidebar.
- Bandai’s store, shop locator, or teaching app inlined.
- A third wave of 20 World-only seats. No fruit pictures. No plot.
- Changing the shipped set-grid default (Price · high to low, PR #28).
- S$ chips on Sets (5.4 is Portfolio).
- Search on World.

## v2 on the glass

**Start.** Search field first: `Find a card or a box` → `/?q=` (existing Sets search) and marks started. Collect: *Find a card or a box, then see what you have and what it is worth today.* Play opens **`/learn`**, not empty Decks: *The rules in five sentences, then Bandai’s own. Build a deck from your cards.* World unchanged.

**Sets.** Same tiles, oldest EN first. The existing jump line also has **cheapest box** → `#cheapest-box` (today OP-16). The tile still prints the dated seed. Starter-deck jump stays.

**Learn.** Two labeled words first: **DON!!** (currency, ten cards) and **Life** (cards in a pile; a hit moves one to hand). Then the five sentences, split into shorter lines; sentence 1 adds that the leader stays in play and holds your life. Then a jump to **36 starter decks**. Then Bandai outbound: how-to-play page, rules page (now names the playsheet), overview, manual, comprehensive, YouTube last. Then Standard/Extra → Decks. Back falls back to Start.

## Data
No new feed. `cheapestReleasedBox()` reads `rosterSealedProduct` (TCGCSV newest row, else roster). A set with no figure is not the jump target.

## Research → response (40: 20 shop Collectr then Piecebook, 20 learn Bandai then Piecebook)

| Heard (of 40) | Response |
|---|---|
| ~17 of 20 learners — Play door opens empty Decks; the five sentences are a second link | Play door → `/learn` |
| ~12 of 20 shoppers — Collect / first fold is ownership or a $1400 box, not “find a card or a box” | Collect copy names find a card or a box. Lowest box seed jump. Not a cart |
| ~8 of 20 shoppers — starter / cheap gift sits under Romance Dawn | Existing starter jump kept; lowest box seed added |
| ~8 of 20 learners — DON!! and life are buried in long sentences; Bandai’s page never prints them | Labeled DON!! and life on Learn; sentences split |
| ~6 of 20 learners — first fifty should be a starter, not New deck | Jump to `#starter-decks` under the sentences |
| ~5 — Bandai how-to-play / playsheet / tournament stack incomplete on Learn | How-to-play row; rules-page note names playsheet and tournament rules. No invented PDF path |
| ~11 shop (first wave sent to `/belong`) — World has no search or price | Not taken. Reviewers now start at home. No World-only wave |
| ~6 new shoppers — set grid Price · high to low | Not taken. Shipped default. Search + lowest box + starters are the first-buy path |
| 1 (C06) — S$ on Sets tiles | Not taken. 5.4 stays Portfolio |
| 5 on v1 — search on Start | Built in v2: same Sets field, `/?q=` |

## Decisions (draft v2 — for Jib)
1. Play door is Learn. Decks stays the tab and the last line on Learn.
2. Collect copy is find, then own. Not a shop. Start search is the existing Sets field.
3. Cheapest box is a jump, not a new sort. Oldest-first tiles stay. The tile still says seed.
4. Learn leads with DON!! and life, then the five sentences, then starters, then Bandai.
5. World is not this pass.

## Not taken, noted for later
- Search field on Start.
- Newest box tile on Start.
- Colour search defaulting to Price · low to high.
- Variant facet (`Manga Art`).
- S$ on box tiles.
- Search on World.
- An authored board diagram (send people to Bandai’s playsheet).

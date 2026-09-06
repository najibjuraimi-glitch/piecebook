# Piecebook V1 — Customer lenses (shop + learn)
(Design addendum, draft v3 after Jib’s new-tab note; approved by Jib 6 Sep 2026 SGT)

Owner: Code as interim Cards, from Jib’s 6 Sep instruction to review Collectr and Bandai how-to-play, then live Piecebook, 20 shop + 20 learn (10 new / 10 play each), then Jib as a new tab  
For: Design (critique), then Jib  
Covers: Start here doors, Sets jumps, Learn to play — a pass on Collect and Play **before the next phase**  
Reads with: `V1-DESIGN-PACK.md`, `V1-STARTER-DECKS-LINKS-LEARN-UI.md` (6.7), `V1-SETTILE-AND-GRID-PRICES.md`, `V1-BELONG-UI.md` (8.1), `seed-sources.md`  
Design seats: `docs/review/lenses/design/`

Not a shop. No cart. No World-only third wave — those 40 already saw the World tab. No 9.2.

## Why
The three pillars are up. Jib asked to look through shopper and learner eyes before opening the next phase. Collectr’s One Piece grid is a chase ticker (Price high to low, SAMPLE, Shop, +). Bandai’s how-to-play page is a funnel (video, boxes, official shop, app) and does not teach a turn. Piecebook already has the honest pieces (dated seed, five sentences, starter rows). The first door often missed them.

Jib then sat as a new tab (6 Sep): Collect / Play / World are *our* words. Collectr is instantly a card shop. Bandai Asia (`https://asia-en.onepiece-cardgame.com/`) is instantly the card game. Piecebook’s Start here was not, even to the person building it. A stranger should not have to know our pillars to find cards, learn the TCG, or open the story.

## What we will not do
- A cart, checkout, or buy button.
- Collectr chrome: % badges, +, SAMPLE, PRO price range, multi-TCG sidebar.
- Bandai’s store, shop locator, or teaching app inlined.
- A third wave of 20 World-only seats. No fruit pictures. No plot.
- Changing the shipped set-grid default (Price · high to low, PR #28).
- S$ chips on Sets (5.4 is Portfolio).
- Search on World.

## v3 on the glass

**Start is `/`.** Wordmark, then a visitor subline: *One Piece cards. Prices, the game, and the story.* Search field: `Find a card or a box` → `/sets?q=` (existing Sets search). Three doors — visitor title as the big type, house name as a muted eyebrow only. On the phone each door is a row with a 96px product chip so all three jobs sit on the first fold; from tablet each door is a set-tile card with a 3:2 art band. Art we already serve:

| Eyebrow | Title | Art | Opens |
|---|---|---|---|
| Collect | Find a card or a box | Cheapest released EN box (`cheapestReleasedBox()`, today OP-16) | `/sets` |
| Play | Learn to play | ST-21 Gear 5 starter box (else ST-08) | `/learn` |
| World | Story, people, fruits | Printed card `OP01-003` Monkey.D.Luffy | `/belong` |

No accent on any door. No wiki image. No fruit picture. The “New to the game?” line is *Learn to play in five sentences.* Tab bar is still Sets · Collection · Decks · Portfolio · **World**.

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
| Jib as a new tab — Collect / Play / World are our words; Collectr and Bandai Asia name the place | v3: visitor titles, subline, existing box/card art on each door |

## Decisions (approved 6 Sep 2026)
1. Play door is Learn. Decks stays the tab and the last line on Learn.
2. Collect copy is find, then own. Not a shop. Start search is the existing Sets field.
3. Cheapest box is a jump, not a new sort. Oldest-first tiles stay. The tile still says seed.
4. Learn leads with DON!! and life, then the five sentences, then starters, then Bandai.
5. Start speaks visitor language. Collect / Play / World stay muted house names. The headlines are Find a card or a box / Learn to play / Story, people, fruits.
6. Each Start door carries existing product art (box or a printed card). No wiki, no fruit art, no cart.
7. World is still the chrome name and the `/belong` door. No World-only review wave.

## Not taken, noted for later
- Newest box tile on Start.
- Colour search defaulting to Price · low to high.
- Variant facet (`Manga Art`).
- S$ on box tiles.
- Search on World.
- An authored board diagram (send people to Bandai’s playsheet).

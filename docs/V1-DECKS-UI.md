# Piecebook — V1 Decks: where they live, the builder, the collection gap, legality (Design addendum, v2 after user research)
As of: 5 Sep 2026 SGT  
Owner: Code, drafted from rendered mockups and ten simulated user reviews; approved by Jib 5 Sep 2026 SGT  
For: Code (implement), Design (critique)  
Amends: `V1-DESIGN-PACK.md` § Global nav (three tabs → four), § Routes; `V1-WATCHLIST-AND-CHARTS.md` § Watchlist (the star gains a "star the gap" use)  
Growth map: 6.1, 6.2, 6.3, 6.4 (6.5 starter decks, 6.6 decks that play this card, 6.7 learn to play follow in the next draft)

## Why
The Play pillar needs a home. A player builds a leader and fifty cards, wants to know in plain words what is wrong with the list, what the collection already covers and what the rest would cost, and whether the list is legal in Standard. Everything runs on data already in the repo (card attributes from 1.0, seed prices, the local collection); nothing is scraped, nothing leaves the browser.

v1 of this draft was reviewed by ten simulated users with distinct profiles (tournament grinder, brand-new player, pure collector, parent of a young player, content creator, small-phone commuter, low-vision user, lapsed returning player, budget player, shop owner). v2 answers what they had in common; the "Research → response" section at the end maps every finding to what changed.

## Tokens
Unchanged. Accent only on **New deck** (the one primary action on Decks home). Good / bad only on the phrases **Not Standard legal** and the signed figures; every state is also carried by words.

## 6.1 Where decks live — decided: a fourth tab, **Decks** (10 of 10)
Sets · Collection · **Decks** · Portfolio on the phone tab bar and the desktop top bar; `/decks` is Decks home. Every one of the ten reviewers chose the tab: one thumb-tap from anywhere; a deck is a shopping list or a plan, not a view of what you own, so filing it under Collection misled them; and the Collection variant dropped the legality and colour words from the deck rows. The pack's "four tabs only" already allowed a fourth; it listed it as omitted, not forbidden. The option-B prototype is removed.

## 6.2 Deck builder — `/decks`, `/decks/:id`
**Decks home.** Title **Decks**, subline `n decks`. Rows: leader art, deck name, `Red · 50 of 50 · Standard legal` (or `Not Standard legal`, `Extra only`, `No leader`). **New deck** primary. Empty: `No decks yet` · `Pick a leader, add fifty cards, and see what you already own.` · New deck.

**Builder.** One column on phone; from desktop a two-column layout with leader, check and Add cards on the left and the fifty on the right, so tapping steppers never hides the count.

1. Breadcrumb `Decks › name`; the name is an inline field in display type.
2. **Leader** card: art, name, `OP09-001 · Red · Life 5`, **Change**. Empty deck: `Pick a leader below, or paste a list.`
3. **Check** — `50 of 50 cards` (`· ready to play` when complete and Standard legal; `· Extra only` when complete but not), then one sentence per issue, each naming the card and linking to its row: `1 card is outside Red: Thunder Lance Flip Caliber Phoenix Shot (OP09-040).` · `4 more cards to reach 50.` · `5 copies of Uta (OP09-002); a deck runs 4 at most.` · `Shanks (OP09-001) is a leader and cannot sit in the fifty.` Then legality (6.4) from Limitless's published Standard / Extra flags: `Standard legal · Extra legal`, or **Not Standard legal**: every offending card by name, no truncation, `· Extra legal`. Under it one muted sentence: `Standard is the format most events use; cards from blocks that have rotated out are not legal in it. Extra allows every card. Legality here is as Limitless publishes it.` (No rotation dates: they are not in our data.)
4. **Add cards** directly under the check: search by name or number; chips **Red · All colours · Standard only · Owned**; each result row carries `Cost 2 · 3000 · Counter +1000` and `Character · US $2.18 · 2 owned · not Standard`, so five cards called Monkey.D.Luffy can be told apart without leaving the page. Empty: `No cards match with these filters.` In leader mode (new deck or **Change**) the same field lists Leaders only, with **Standard only · Owned** chips and a **Lead** button.
5. **The fifty by category** — Characters, Events, Stages — rows sorted by cost: art, name, `OP09-008 · Cost 1 · 2000 · Counter +1000`, a stepper 0–4 whose number is a field (tap it, type a count) with a visibly hollow disabled state, and where it applies a muted `outside Red` / `not Standard` under the meta. A row named in an issue sentence lifts briefly when the sentence is tapped.
6. **From your collection** (6.3): `You own 11 of 51 · 40 missing`, then `US $9.02 to complete · the whole deck is US $14.60 · seed prices as of 5 Sep 2026` (cards without a seed price are counted and said so); **Missing** rows `Uta OP09-002 · need 4 · $0.29 each · $1.16`; ghost **Star the 11 missing cards**; then **You have** rows `Shanks OP09-004 · 4 of 4`. Any print of a number counts as owned.
7. **Start from a list** on an empty deck sits right under Choose a leader, with the textarea open: `Paste a list from another deck tool; the leader and the fifty come in together.` On a deck with cards it becomes **Copy as text** / **Paste a list** lower down. Plain `4xOP09-004` lines, leader first; paste accepts `4xOP09-004`, `4 OP09-004` and bare numbers, and reports what it could not read or does not have in the seed.
8. **Pinned strip** above the tab bar (sticky, always visible while editing): `50 of 50 · Not Standard legal` (tap → the check), **Copy**, and for a few seconds after any change a one-step **Undo** line (`Added Monkey.D.Luffy · Undo`, `Uta 2 → 4 · Undo`).
9. **Delete deck** with an inline confirm, last.

**Rules encoded (Bandai's):** one leader; exactly fifty in the list; four copies of a number at most (a parallel is the same card); every card shares a colour with the leader; leaders cannot sit in the fifty. DON!! cards are not listed.

**Data:** decks in `localStorage` (`piecebook.decks.v1`), base numbers only. All card attributes load when a Decks screen opens (about 100 kB gzipped across the 23 per-set chunks); nothing new in the main bundle. Prices are the seed `market_usd` shown as `US $` with their date, as everywhere else.

## Research → response
| Finding (of 10) | Response |
| --- | --- |
| 9 — page too long, feedback far from the thumb | Built: pinned strip with live count · legality · Copy; Add cards moved under the check; two columns from desktop; Start from a list at the top of an empty deck; From your collection above the text tools. |
| 6 — issues name numbers, guilty rows unmarked, "and 5 more" | Built: sentences name the card, link to its row, list every card; rows carry `outside Red` / `not Standard`. |
| 6 — Standard / Extra unexplained and absent where decisions are made | Built: one explanatory sentence; legality on result rows, leader picker and the fifty; **Standard only** chip. |
| 6 — prices unclear ("seed", bare `$`), no price on results, no totals | Built: `US $` with the as-of date; price on every result and leader row; per-line totals; whole-deck total. |
| 5 — Paste a list buried | Built: Start from a list on an empty deck, open by default. |
| 4 — same-name results indistinguishable, meta truncates | Built: cost · power · counter on every row; layout stops truncating on phone. |
| 4 — steppers: many taps, accidents, faint disabled state | Built: type-a-number field in the stepper; hollow disabled state; one-step Undo in the strip. |
| 3 — owned status missing; wanted an Owned filter and a "you have" list | Built: `2 owned` on results, **Owned** chip (results and leader picker), **You have** list in the collection panel. |
| 1–3 — share link / QR, screenshot grid, duplicate deck | Later: a share URL that encodes the list is feasible without a server and is proposed for the next draft; grid view and duplicate follow. |
| 1 — counter tally / cost curve | Later; noted for the tuning view. |
| 1 — grey-on-cream contrast | Partly: meta rows lifted a step; a full contrast pass is a design task across the app. |
| 2 — ready-made starter and tournament lists | Next draft: 6.5 starter decks (data already prepared from TCGCSV and Limitless) and 6.6 the Limitless deck link on card detail. |

## Decisions (approved 5 Sep 2026)
1. Fourth tab **Decks** (10 of 10 users).
2. The pinned strip is the only sticky element on the builder besides the tab bar.
3. Add-cards defaults to the leader's colours; **Standard only** and **Owned** are off by default.
4. Whole-deck total is shown next to the gap (in `US $`, dated); no S$ until 5.4 lands.
5. Text format `4xOP09-004`, leader first; import replaces the list (with Undo).

## Out of scope (this draft)
6.5 starter decks on the roster, 6.6 link to Limitless decks per card, 6.7 learn-to-play page, share links, screenshot grid, duplicate deck, DON!! cards, sideboards, sync, hand simulation.

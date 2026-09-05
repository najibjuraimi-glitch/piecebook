# Piecebook — V1 Decks: where they live, the builder, the collection gap, legality (Design addendum — DRAFT)
As of: 5 Sep 2026 SGT  
Owner: Code (draft for Jib / Design approval; not yet built for merge)  
For: Design (review), Code (implement once approved)  
Amends: `V1-DESIGN-PACK.md` § Global nav (three tabs → four), § Routes; `V1-WATCHLIST-AND-CHARTS.md` § Watchlist (the star gains a "star the gap" use)  
Growth map: 6.1, 6.2, 6.3, 6.4 (6.5 starter decks, 6.6 decks that play this card, 6.7 learn to play follow in the next draft)

## Why
The Play pillar needs a home. A player builds a leader and fifty cards, wants to know in plain words what is wrong with the list, what the collection already covers and what the rest would cost, and whether the list is legal in Standard. Everything runs on data already in the repo (card attributes from 1.0, seed prices, the local collection); nothing is scraped, nothing leaves the browser.

## Tokens
Unchanged. Accent only on **New deck** (the one primary action on Decks home). Good / bad only on the legality phrase.

## 6.1 Where decks live — recommendation: a fourth tab, **Decks**
Two placements were rendered:
- **A. Fourth tab.** Sets · Collection · **Decks** · Portfolio, phone tab bar and desktop top bar. `/decks` is Decks home.
- **B. Under Collection.** A **Decks** section at the top of Collection with a "New deck" link; three tabs stay.

Recommendation **A**. The objective names three equal pillars and Phase 8 opens three doors (Collect · Play · Belong); a deck is not a view of what you own, so filing it under Collection buries Play and muddles "owned" with "built". Four quiet tabs still read as one bar. The pack's "four tabs only" line already allowed four; it listed the fourth as omitted, not forbidden.

## 6.2 Deck builder — `/decks`, `/decks/:id`
**Decks home.** Title **Decks**, subline `n decks`. Rows: leader art, deck name, `Red · 50 of 50 · Standard legal` (or `Not Standard legal`, `No leader`). **New deck** primary. Empty: `No decks yet` · `Pick a leader, add fifty cards, and see what you already own.` · New deck.

**Builder, one column, top to bottom.**
1. Breadcrumb `Decks › name`; the name is an inline field in display type.
2. **Leader** card: art, name, `OP09-001 · Red · Life 5`, **Change**. Without a leader: `Search for a leader below to start the deck.`
3. **Count and every issue in words**: `50 of 50 cards` (`· ready to play` when complete and Standard legal; `· Extra only` when complete but not), then one line each: `No leader yet.` · `4 more cards to reach 50.` · `5 copies of OP09-004; a deck runs 4 at most.` · `1 card is outside Red: OP09-040.` · `OP09-001 is a leader and cannot sit in the fifty.`
4. **Legality** (6.4), one line from Limitless's published Standard / Extra flags: `Standard legal · Extra legal`, or **Not Standard legal**: `OP01-004` (first four, then `and n more`) `· Extra legal`. Shown only once every card's attributes are known.
5. **The fifty by category** — Characters, Events, Stages — rows sorted by cost: art, name, `OP09-008 · Cost 1 · 2000`, stepper 0–4. Tap the art → card detail.
6. **Add cards**: search by name or number; results filtered to the leader's colours by default with a **Red · All colours** toggle; each result row carries category · colour · cost and a stepper. In leader mode (new deck or **Change**) the same field lists Leaders only with a **Lead** button.
7. **From your collection** (6.3): `You own 11 of 51 · 40 missing · $9.02 to complete at seed prices`, the missing list (`Uta OP09-002 · need 4 · $0.29 each`), and a ghost **Star the 11 missing cards** that puts the gap on the watchlist. Any print of a number counts as owned.
8. **Copy as text** / **Paste a list**: plain `4xOP09-004` lines, the form deck tools exchange; the leader first. Paste accepts `4xOP09-004`, `4 OP09-004`, bare numbers, and reports what it could not read or does not have in the seed. **Replace the list with this** applies it.
9. **Delete deck** with an inline confirm.

**Rules encoded (Bandai's):** one leader; exactly fifty in the list; four copies of a number at most (a parallel is the same card); every card shares a colour with the leader; leaders cannot sit in the fifty. DON!! cards are not listed.

**Data:** decks in `localStorage` (`piecebook.decks.v1`), base numbers only. All card attributes load when a Decks screen opens (about 100 kB gzipped across the 23 per-set chunks); nothing new in the main bundle.

## Decisions for approval
1. Fourth tab **Decks** (A) rather than a section under Collection (B).
2. Issues are sentences, one per line, no icons or colour except the **Not Standard legal** phrase.
3. Add-cards results default to the leader's colours; one toggle widens to all.
4. Missing cards can be starred in one tap; nothing else touches the watchlist.
5. Text format `4xOP09-004`, leader first.

## Out of scope (this draft)
6.5 starter decks on the roster, 6.6 link to Limitless decks per card, 6.7 learn-to-play page, DON!! cards, sideboards, sharing or sync, hand simulation, price of the whole deck beyond the gap.

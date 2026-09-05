# Piecebook V1 — Find: search facets, artists, characters, upcoming sets
(Design addendum — DRAFT v1, before user research)

Owner: Code (draft for Jib / Design approval)  
For: Design (review), Code (implement once approved)  
Covers growth-map 2.3 (player search facets), 7.3 (artists), 7.4 (characters, watch star), 7.5 (upcoming sets on the roster)  
Reads with: `V1-DESIGN-PACK.md` (paper, ink, one accent, no marketplace chrome, no invented data), `V1-DECKS-UI.md` (the builder's search and chips, which this reuses), `seed-sources.md`

## Why these four together
They are one question — *find me the cards* — asked four ways: by what a card is (colour, type, cost, trait, keyword, owned), by who drew it, by who is on it, and by what is coming. Every one of them reads data the daily refresh already produces (attributes from Limitless, products and dates from TCGCSV); nothing is typed by hand.

## 2.3 Facets on search
**Where.** Under the search field on Sets home (and, with the same component, under the search on a set page). Nothing shows until the field has text or a facet is on; the tiles hide as they do now.

**Chips, one row, scrolls sideways on phone.** `Red Green Blue Purple Black Yellow` · `Leader Character Event Stage` · `Cost` (opens 0–10 as a second row of small chips) · `Trait` (opens a search-as-you-type list of the 166 traits Limitless records, e.g. Straw Hat Crew, Navy) · `Owned`. Selected chips are ink on paper with a hairline, as in the builder; nothing coloured. Colour chips carry no swatch — the word is enough and the six words are the game's own.

**Typed words become facets.** The query is read for words we know before it is matched against names: a colour, a type, `cost 4` / `4 cost`, a trait, an effect keyword (`Blocker`, `Rush`, `Trigger`, `Banish`, `Double Attack`, `On Play`, `On K.O.`, `Counter`), `owned` / `I own`. `red blocker I own` lights the Red and Owned chips and searches effects for Blocker; what is left of the query, if anything, matches names as today. A recognised word shows as a lit chip so the reader sees what happened; tapping the chip off removes it from the query.

**Results** stay grouped by set in roster order, one row per print with rarity, price and owned count, as global search does now. A first line states the reading in words: `38 red cards with Blocker you own`. Zero results: `No red Blockers in the sets you own cards from. Try without Owned.`

**Rules.** Facets need every set's attributes; they load once on first use (the builder already does this), with a one-word `Loading…` under the field until then. Parallels inherit their base print's attributes.

## 7.3 Artists
**Page** `/artists/:name` — BackBar with the artist's name as written by Limitless; meta line `N prints across M sets`; the prints grouped by set in roster order as card tiles (same grid as a character page), owned count and star on each. A final quiet line: `Credits are Limitless's; prints they have not credited are not listed.` (Limitless credits no artist for about a quarter of prints, mostly older sets and reprint products.)

**Doors.** `Illustrated by kankurou` on card detail becomes a link. Typing a name into search shows an `Artists` group above `Across sets` when it matches an artist: `kankurou · 130 prints`. No artist index page: 195 names is a list nobody scrolls; search is the index.

## 7.4 Characters
**What exists.** `/characters/:name` (2.4) lists every print of a name grouped by set, reached only from `Across sets` in search.

**Two additions.** (1) Card detail gets a door: under the card's name, `All prints of Shanks · 14` links to the character page. (2) The character page gets the same star as cards and sets. Starring a character puts one row in Watching: `Shanks · 14 prints`, then the print that moved most since you starred — `OP09-118 +US $12.40 since 5 Sep` — because a watched name is a question about movement, not a sum. Tap → character page. Unstarring removes the row; prints starred individually keep their own rows.

**Storage.** `piecebook.watchlist.v1` gains `characters`, keyed by name, same `{ at }` shape as cards and sets.

## 7.5 Upcoming sets on the roster
**Source.** TCGCSV lists a set's TCGplayer group weeks before release, with a Booster Box product that carries the official render, a presale flag, the release date and, once pre-orders open, a market price. Today that is *Extra Booster: One Piece Heroines Edition Vol.2* (30 Oct 2026) and *The Dominance of God* (20 Nov 2026). Limitless does not list either yet (404), so there is no checklist to seed.

**Discovery is automatic.** The daily refresh reads every group in the One Piece category; a group with a `… Booster Box` product on presale (not a case, not a deck set, not release-event promos) becomes a roster row with `cardSeedStatus: pending`, its TCGplayer name, date, product id and group id. Each day it probes Limitless for the set; when Limitless publishes it, the checklist seeds and the row turns `ready` on its own. Nothing is typed.

**The code.** TCGCSV names carry no set code. Bandai numbers main boosters OP‑nn and extra boosters EB‑nn in sequence, so the refresh assigns the next number by product type and marks it `codeProvisional: true` until Limitless confirms the code (its set page carries it). Until then the tile shows the set's name large and no code; a provisional code is never shown. A set whose type we cannot classify (a *Deck Set*, a promo) is logged by `seed:check` as a warning, not added.

**Tile.** In the booster grid in date order, so upcoming sets sit last: the render, the name, `Coming 20 Nov 2026`, and `pre-order market US $xx · TCGplayer` where a presale price exists; no packs / cards line. A `Coming soon · 2 sets` jump link sits at the top of Sets home beside the starter-deck link.

**Page.** BackBar name, meta `Coming 20 Nov 2026`; the BoxCard with the presale market labelled `pre-order market`; one sentence — `The checklist appears here the day Limitless lists the set.`; the star works (watch the set), search is hidden.

## Decisions for approval
1. Facets live on search (Sets home and set page), and typed words become chips; no separate filter screen.
2. Effect-keyword facets read the effect text (Limitless has no keyword field); the eight keywords listed are the set.
3. No artist index; search is the index. Artist pages say credits are Limitless's.
4. A watched character shows its biggest mover since starred, not a total.
5. Upcoming sets are discovered from TCGCSV automatically; set codes are provisional by sequence and never displayed until Limitless confirms them.
6. Upcoming tiles sit last in the date-ordered grid with a jump link at the top; pre-order market is shown, labelled.

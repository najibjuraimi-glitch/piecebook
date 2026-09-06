# Piecebook V1 — Find: search facets, artists, characters, upcoming sets
(Design addendum, v2 after user research: ten simulated reviewers, 5 Sep 2026)

Owner: Code, drafted from rendered mockups and ten simulated user reviews; approved by Jib 6 Sep 2026 SGT  
For: Code (implement), Design (critique)  
Covers growth-map 2.3 (player search facets), 7.3 (artists), 7.4 (characters, watch star), 7.5 (upcoming sets on the roster)  
Reads with: `V1-DESIGN-PACK.md` (paper, ink, one accent, no marketplace chrome, no invented data), `V1-DECKS-UI.md` (the builder's search and chips, which this reuses), `seed-sources.md`

## Why these four together
They are one question — *find me the cards* — asked four ways: by what a card is (colour, type, cost, trait, keyword, owned), by who drew it, by who is on it, and by what is coming. Every one of them reads data the daily refresh already produces (attributes from Limitless, products and dates from TCGCSV); nothing is typed by hand.

## 2.3 Facets on search
**Where.** Under the search field on Sets home (and, with the same component, under the search on a set page). Nothing shows until the field has text or a facet is on; the tiles hide as they do now.

**Chips, one line that never scrolls.** Lit value chips first, in the order the query was read (`Red` `Blocker` `Owned`), then `Owned` when nothing about ownership is lit, then four openers: `Colour ⌄` `Type ⌄` `Cost ⌄` `Trait ⌄`. An opener unfolds its values as a wrapping row beneath (the six colours in the game's order; Leader Character Event Stage; 0–10; a type-ahead over the 166 traits Limitless records) and closes when one is chosen; the chosen value joins the lit chips at the head. The base line fits a 390px phone; with several lit chips it wraps to a second line rather than hiding anything sideways. Lit chips are ink-filled, others hairline, as in the builder; nothing coloured, no swatches. `Owned` cycles Owned → Missing → off, because a collector's question is as often what is lacking.

**Typed words become facets.** The query is read for words we know before it is matched against names: a colour, a type, `cost 4` / `4 cost`, a trait (longest phrase wins and punctuation is ignored, so `red haired pirates` is the trait Red-Haired Pirates, not the colour), an effect keyword (`Blocker`, `Rush`, `Trigger`, `Banish`, `Double Attack`, `On Play`, `On K.O.`, `Counter`), `owned` / `I own`, `missing` / `need`. Every recognised word shows as a lit chip so the reader sees what happened; tapping a chip off removes the word from the query. Connectives (`or`, `and`, `cards`) fall away; a set code in any spelling (`op18`, `EB-05`) shows the set as a row at the top.

**A keyword means the card has it.** `[Blocker]` counts only where it opens the effect text or opens an ability inside it (after a full stop, a closing bracket of reminder text, or a preceding tag such as `[On Play]`); a mention inside another sentence — "when your opponent activates [Blocker]", "cannot activate a [Blocker] Character", "gains [Banish]" — does not. Seven of ten reviewers caught the v1 prototype calling a Rush card a Blocker. `Trigger` reads the trigger column or a `[Trigger]` that opens an ability.

**Results** stay grouped by set in roster order, one row per print with rarity, price and owned count, as global search does now. A first line, in ink, states the reading in words and its logic: colours are any-of (`135 red or green Blockers`; a two-colour card matches either), everything else all-of; `62 red Blockers you don't own`. Zero results: `No red Blockers among the cards you own. Try without Owned.` The search field reads `Search cards, sets, artists`.

**Rules.** Facets need every set's attributes; they load once on first use (the builder already does this), with a one-word `Loading…` under the field until then. Parallels inherit their base print's attributes.

## 7.3 Artists
**Page** `/artists/:name` — eyebrow `Illustrator`, the name as written on the card; meta `122 credited prints across 35 sets · you own N`, and directly beneath it, small: `Credits are Limitless's, written as on the card; prints they have not credited are not listed.` (about a quarter of prints carry no credit, mostly older sets and reprint products). Spellings that differ only in case or spacing fold into one page (`also credited as Eiji kaneda`). The prints grouped by set, **newest set first** — an illustrator's page is where the chase art is — as card tiles with owned count and star; group headers count `prints`, as the character page now does too.

**Doors.** `Illustrated by kankurou` on card detail becomes a link. Typing a name into search shows an `Artists` group above `Across sets` when it matches an artist: `kankurou · 130 prints`. No artist index page: 195 names is a list nobody scrolls; search is the index.

## 7.4 Characters
**What exists.** `/characters/:name` (2.4) lists every print of a name grouped by set, reached only from `Across sets` in search.

**Two additions.** (1) Card detail gets a door: under the card's name, `All prints of Gol.D.Roger · 7` links to the character page (absent for a name printed once). (2) The character page gets the same star as cards and sets; every star is a button with `aria-pressed` whose label names its subject (`Watch Shanks`, `Stop watching The Dominance of God`). Starring a character puts one row in Watching: `Shanks · 38 prints`, then the print that moved most since you starred, named as the character page names it and with its price: `Alternate Art · OP-17 · US $31.71 · −US $268.28 since you starred 27 Jul`. A move under US $1 reads `quiet since you starred 27 Jul`; no history at all, `no price history yet`. Movement is set in ink, never red or green. Tap → character page. Unstarring removes the row; prints starred individually keep their own rows. (Reviewers split three ways on which print a watched name should report — the biggest mover, the cheapest playable print, or new prints; the mover stays, named, and the others are noted for later.)

**Storage.** `piecebook.watchlist.v1` gains `characters`, keyed by name, same `{ at }` shape as cards and sets.

## 7.5 Upcoming sets on the roster
**Source.** TCGCSV lists a set's TCGplayer group weeks before release, with a Booster Box product that carries the official render, a presale flag, the release date and, once pre-orders open, a market price. Today that is *Extra Booster: One Piece Heroines Edition Vol.2* (30 Oct 2026) and *The Dominance of God* (20 Nov 2026). Limitless does not list either yet (404), so there is no checklist to seed.

**Discovery is automatic.** The daily refresh reads every group in the One Piece category; a group with a `… Booster Box` product on presale (not a case, not a deck set, not release-event promos) becomes a roster row with `cardSeedStatus: pending`, its TCGplayer name, date, product id and group id. Each day it probes Limitless for the set; when Limitless publishes it, the checklist seeds and the row turns `ready` on its own. Nothing is typed.

**The code comes from the source.** TCGCSV's group names carry no code, but the group already lists the revealed single cards with their numbers (`OP18-021`, `OP18-119`; `EB05-005`) and an abbreviation (`OP18`, `EB-05`). The refresh takes the strict majority prefix of the card numbers (a reprinted `OP17-119` in the group is outvoted), cross-checks the abbreviation, and records `codeSource: tcgcsv-cards`; so `OP-18` and `EB-05` are facts, shown and searchable like any code. Only a group with neither cards nor abbreviation falls back to the next number in sequence, marked provisional, never displayed, re-read every day and corrected if wrong; `seed:check` warns on those alone. A group we cannot classify (a *Deck Set*, release-event promos) is logged, not added.

**Tile.** In the booster grid in date order, so upcoming sets sit last. Eyebrow `EN SET · OP-18` or `EN EXTRA BOOSTER · EB-05`; the name once, without TCGplayer's `Extra Booster:` prefix (`One Piece Heroines Edition Vol.2`); `Coming 20 Nov 2026` in ink; the price line in the same shape as every released tile, `Box · pre-order US $399.72 · as of 4 Sep 2026`. While TCGplayer has no render yet (their CDN serves none for either box today) the art band is a short quiet field carrying only the date, not the name at display size. The Sets home subline reads `23 booster sets, 2 coming soon, then 36 starter decks.` with both jump links as 44px targets.

**Page.** `OP-18` / `The Dominance of God`, meta `US release 20 Nov 2026 · TCGplayer's date` (a Singapore store and a Tokyo collector both asked whose date it is; Bandai's Asia dates differ); the BoxCard `EN BOOSTER BOX · $399.72 · pre-order market · TCGplayer · as of 4 Sep 2026`, and from the second reading `−US $8.10 since 4 Sep`; one sentence — `The checklist appears here the day Limitless, our card source, publishes it.`; the star works, and a watched upcoming set's row in Watching reads `Box · pre-order US $399.72 · −US $8.10 since you starred 5 Sep`. Search and rarity tabs hidden. `read daily since …` and `in seed` are gone from every screen.

## Research → response (ten reviewers: competitive player, Tokyo JP/EN collector, new collector, set completionist, art collector, budget parent, box investor, low-vision collector, Singapore store owner, product designer)
| Heard (of ten) | Response |
|---|---|
| 8 — lit chips hidden off-screen; Owned buried | One wrapping line: lit chips first, Owned, then four openers; nothing scrolls sideways |
| 8 — upcoming tile shouts: name twice, sixteen-word TCGplayer name, blank `EN SET`, price without Box or date | Short date band, name once without the prefix, product eyebrow with the confirmed code, `Box · pre-order US $ · as of` |
| 7 — Blocker facet matched a Rush card that mentions Blocker | Keyword counts only where it opens an ability; verified on OP09-118, OP01-120, OP09-084 |
| 7 — Watching row is a code and a delta, sometimes in red | Named print, its price, `since you starred`, ink only, `quiet` under US $1 |
| 4 — starred upcoming set shows only a date | Set row carries pre-order price and movement |
| 4 — insider words: `in seed`, `read daily since`, Limitless unexplained | Removed; Limitless named once, as `our card source` |
| 2 — whose date is `20 Nov`? | `US release … · TCGplayer's date` |
| 1 — TCGCSV carries revealed cards with numbers | Codes confirmed from the source; provisional codes become the rare fallback |
| 1 — `red haired pirates` lit Red | Longest phrase wins, punctuation ignored |
| 1 — Owned finds what I have, not what I lack | `Missing` facet; Owned cycles |
| Split — drop Artists group (2) vs praised (2); drop Cost row (3) vs needed by the player | Both kept; Cost stays behind its opener |
| Not taken — cheapest playable print in the character row; Keyword opener chip with `[When Attacking]` etc.; pre-order history on the pending page; star and Watching for artists | Noted for later phases; none contradicts the design |

## Decisions (approved 6 Sep 2026)
1. Facets live on search (Sets home and set page); typed words become chips; one wrapping line, never a sideways scroll; no separate filter screen.
2. A keyword facet means the card has the keyword (opens an ability), never a mention; the eight keywords are the set for now.
3. No artist index; search is the index. Artist pages fold spelling variants, run newest set first, and say credits are Limitless's.
4. A watched character reports its biggest mover since starred, named and priced, in ink; not a total.
5. Upcoming sets are discovered from TCGCSV automatically and their codes are read from the group's card numbers; a sequence guess is the fallback only and is never displayed.
6. Upcoming tiles sit last in the date-ordered grid, in the same shape as released tiles; the page says whose date and labels the pre-order market with its source and day.

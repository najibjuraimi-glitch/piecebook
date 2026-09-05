# Piecebook — V1 Starter decks on the roster, decks that play this card, learn to play (Design addendum, v2 after user research)
As of: 5 Sep 2026 SGT  
Owner: Code, drafted from rendered mockups and fifteen simulated user reviews; approved by Jib 5 Sep 2026 SGT  
For: Code (implement), Design (critique)  
Amends: `V1-SETS-ROSTER-UI.md` § Sets home (a second group under the booster tiles); `V1-BOX-CARD-AND-ART-UI.md` § BoxCard (product-aware words, deck actions); `V1-DESIGN-PACK.md` § Routes (`/learn`), § Card detail (one outbound row), § Set detail (deck pages file every print by rarity)  
Growth map: 6.5, 6.6, 6.7 (follows 6.1–6.4 in PR #19 and the starter-deck data on `cursor/starter-decks-data-eb1f`)

## Why
The Play pillar's last three pieces are small and all automated. Starter decks are the way most players begin, and they are products with a price and a card list just like a booster box; a player mid-build wants to see what tournament lists do with a card, and a newcomer wants the rules without us rewriting them.

v1 was reviewed by fifteen simulated users (the ten profiles from the Decks round plus a tournament judge, a Japanese-card collector, a 13-year-old with a new starter deck, a player with a hand tremor and a player in Jakarta). v2 answers what they had in common; the judge's three rules corrections were checked against Bandai's comprehensive rules and the Limitless link target against Limitless's live pages.

## Tokens
Unchanged. No accent on any of these screens.

## 6.5 Starter decks — Sets home and set detail
- **Data (already prepared):** 36 decks (ST-01 … ST-36, including the two Ultra Decks) as roster rows with `product: starter_deck`, from the same TCGCSV groups as the boxes: name, EN release date, the deck's TCGplayer product id (daily price and official render). Card lists, attributes and price history come from Limitless like every other set; a deck is a reprint product, so every print on its page belongs to it. ST-14 has no Limitless page and stays a pending checklist. Nothing is typed by hand; a new deck appears the day TCGCSV and Limitless list it.
- **What a deck's checklist is:** the distinct prints Limitless lists (ST-23: 15, of which the leader is a reprint parallel `OP09-001p2`). Bandai publishes the deck's total (51 cards, 10 DON!!) and rarity counts, not copies per card; no automated source does. Everything below says so rather than guessing.
- **Sets home:** the 23 booster tiles stay the page. Under the subline one quiet line, `23 booster sets, then 36 starter decks.`, the count a jump to the group. Beneath the tiles, **STARTER DECKS · 36** with the subline `Ready-made decks Bandai sells, newest number first. Each one is a set of its own here; a row says how many different cards it holds.` Rows in number order (ST-36 → ST-01; release dates scramble the numbering): official render 48px on white, `ST-23 · RED Shanks`, then `you own 1 · 6 Jun 2025 · 15 different cards · US $48.54` — the personal fact first, and the line wraps rather than truncating. A pending deck reads `Checklist soon · not on Limitless yet`.
- **Set detail** for a deck is the existing page with three changes: the product card reads **EN STARTER DECK**; the header says `You own 1 of 15 different cards`; and because a deck's prints are the deck, every print files by rarity (a **Leader** tab appears, there is no Parallels tab) and the leader leads the grid whatever the sort.
- **This deck** — a small card under the price: **Open in Decks** creates a deck named `ST-23 RED Shanks` with the leader and one of each other card and opens the builder (the check then says `14 of 50 cards · 36 more cards to reach 50`); **I have this deck** marks every print in the checklist owned (one each; `All owned` once done). One sentence under both: `Bandai publishes the deck's total and rarities, not how many of each card it holds, so both start with one of each: set the copies from your box.` Then `New to the game? Learn to play.`
- Names are TCGplayer's group names minus the "Starter Deck N:" prefix. Global search already covers deck cards; a card reprinted in a deck keeps its home set and gains the deck as a second membership, as with PRB.

## 6.6 Decks that play this card — card detail
A quiet row under the Play block, 48px tall, the whole row the target: **Decks that play this card** / `Latest tournament lists on Limitless · opens a new tab` ↗. It links to Limitless's page for the card (`/cards/en/{base number}`), which carries "Latest Decks With This Card"; the deck-search address v1 used opens Limitless's general Decks page and is wrong. Link only; nothing is fetched, counted or copied. Parallels link by their base number.

## 6.7 Learn to play — `/learn`
Back arrow, **Learn to play**, subline `Five sentences, then Bandai's own rules`. The five sentences, corrected against Bandai's comprehensive rules and explaining their own terms:
1. Two players each bring a leader and a deck of fifty cards in the leader's colours, plus ten DON!! cards, the currency that pays for everything.
2. Each turn you draw a card and gain two DON!!, then spend DON!! to play characters, events and stages or to give your leader and characters more power; the player who goes first skips the draw, gains one DON!! and cannot attack on their first turn. (6-3-1, 6-4-1)
3. Attacks go at the opponent's leader or their rested characters (cards turned sideways after acting); when a leader takes a hit, the defender moves one life card from their life pile into their hand.
4. The defender can answer with a counter (a card's counter value, played from hand to add power) or a blocker (a character that takes the hit instead), and a life card with a Trigger can fire its effect instead of going to the hand. (2-11-1)
5. You win when your opponent's leader is hit while they have no life cards left, or the moment their deck runs out of cards. (1-2-1-1-1, 1-2-1-1-2)

Then **BANDAI'S RULES**: the rules page (`Bandai's site: how to play, tutorial videos and every document below`), the overview sheet (`PDF · one page, the fastest read`), the rule manual (`PDF · the full starter rulebook`), the comprehensive rules (`PDF · every edge case, as judges read it`), the official channel (`YouTube · Bandai's how-to-play videos`); each row a 52px outbound target whose label says it opens a new tab. Closing line repeats the Standard / Extra sentence and links to Decks. Doors: Decks home, the Standard sentence in the builder, and every starter deck's page. Copy stays ours and stays five sentences; Design may reword.

## Research → response
| Finding (of 15) | Response |
| --- | --- |
| 13 — "15 cards" reads as an error; no one-tap own, no way to open a deck in the builder | Built: `15 different cards` everywhere; **Open in Decks** (leader + one of each) and **I have this deck**, with the copies sentence. No copies are invented. |
| 9 — long scroll, scrambled order, unexplained pending deck, no colour scan | Built: jump link from the top, number order, `not on Limitless yet`. Later: colour from the leader's attributes for decks whose names carry none. |
| 8 — rows truncate; "you own" is what gets cut | Built: rows wrap; `you own N` leads the line. |
| 8 — US $ only | 5.4 (re-opened): dated S$ at an official rate, its own draft. |
| 6 — Limitless line small, blind, beside the Owned toggle, surprise new tab | Built: a 48px row of its own, says it opens a new tab, sits under the Play block above Own. |
| 4 — deck page buries the leader, no Leader tab | Built: deck pages file every print by rarity (Leader tab), leader first in every sort. |
| 1 (judge) — three sentences wrong or incomplete; link target wrong | Built: sentences corrected against the comprehensive rules; link moved to Limitless's card page. |
| 3 — jargon unexplained (rested, counter, blocker, DON!!) | Built: defined inside the five sentences. |
| 2 — no back arrow, no door from a deck page | Built: BackBar on Learn; door on every deck page. |
| 1 — sealed decks and boxes counted in Portfolio | Later: sealed ownership is a Portfolio feature (5.x / Phase 4 follow-up). |
| 1 — JP titles and dates on decks | Later: JP layer across sets and decks. |
| 2 — deck price movement / chart | Arrives on its own: the box card's movement line appears at the second daily point. |

## Decisions (approved 5 Sep 2026)
1. Starter decks as rows under the boosters, number order, with a jump link (no tab, no toggle, no filters).
2. Deck pages file every print by rarity and lead with the leader; the count says `different cards`.
3. **Open in Decks** and **I have this deck** prefill one of each with the copies sentence, rather than waiting for data no source publishes.
4. The Limitless row links to Limitless's card page and names the new tab.
5. The five corrected sentences as drafted, pending Design's wording.

## Later
Colour words for decks whose names carry none (from the leader's attributes); sealed ownership in Portfolio; JP titles and dates; Bandai's card Q&A link (judge's wish); Bandai's events page (7.6).

## Out of scope
Sealed prices in S$ (5.4), deck-box art beyond the TCGplayer render, tutorial content of our own beyond five sentences.

# Piecebook — V1 Starter decks on the roster, decks that play this card, learn to play (Design addendum — DRAFT v1)
As of: 5 Sep 2026 SGT  
Owner: Code (draft for reviewer research, then Jib / Design approval; not yet built for merge)  
For: Design (review), Code (implement once approved)  
Amends: `V1-SETS-ROSTER-UI.md` § Sets home (a second group under the booster tiles); `V1-BOX-CARD-AND-ART-UI.md` § BoxCard (product-aware words); `V1-DESIGN-PACK.md` § Routes (`/learn`), § Card detail (one outbound link)  
Growth map: 6.5, 6.6, 6.7 (follows 6.1–6.4 in PR #19 and the starter-deck data on `cursor/starter-decks-data-eb1f`)

## Why
The Play pillar's last three pieces are small and all automated. Starter decks are the way most players begin, and they are products with a price and a card list just like a booster box; a player mid-build wants to see what tournament lists do with a card, and a newcomer wants the rules without us rewriting them.

## Tokens
Unchanged. No accent on any of these screens.

## 6.5 Starter decks — Sets home and set detail
- **Data (already prepared):** 36 decks (ST-01 … ST-36, including the two Ultra Decks) as roster rows with `product: starter_deck`, from the same TCGCSV groups as the boxes: name, EN release date, the deck's TCGplayer product id (daily price and official render). Card lists, attributes and price history come from Limitless like every other set; a deck is a reprint product, so every print on its page belongs to it (the rule PRB already used). ST-14 has no Limitless page and stays a pending checklist. Nothing is typed by hand; a new deck appears the day TCGCSV and Limitless list it.
- **Sets home:** the 23 booster tiles are the page as before. Beneath them one quiet group, **STARTER DECKS · 36**, subline `Ready-made decks Bandai sells, newest first. Each one is a set of its own here.`, then rows (not tiles): official render 48px on white, `ST-23 · RED Shanks`, `6 Jun 2025 · 15 cards · US $48.54`, and `· you own 3` once any of its cards are owned. Rows keep 36 decks to one scroll and keep the boosters in front.
- **Set detail** for a deck is the existing page: the product card reads **EN STARTER DECK** with the deck render and daily price; About this set shows the EN date; search, sort, rarity tabs and the grid work as for any set. `You own 1 of 15` in the header.
- Names are TCGplayer's group names minus the "Starter Deck N:" prefix (`RED Shanks`, `Gear 5`, `The Three Captains`). Deck card lists show the distinct cards on Limitless's page; copies per card are not in our data, so a starter deck cannot yet be opened as a ready deck in the builder (see Later).
- Global search already covers deck cards; a card reprinted in a deck keeps its home set and gains the deck as a second membership, as with PRB.

## 6.6 Decks that play this card — card detail
One muted line under the Play block: **Decks that play this card** · tournament lists on Limitless ↗, linking to `https://onepiece.limitlesstcg.com/decks?card={base number}` in a new tab. Link only; nothing is fetched, counted or copied. Parallels link by their base number.

## 6.7 Learn to play — `/learn`
Title **Learn to play**, subline `Five sentences, then Bandai's own rules`. Five sentences of ours on how a game goes (leader and fifty in the leader's colours plus ten DON!!; draw, gain DON!!, spend them; attacks on the leader or rested characters take life cards into hand; counters, blockers and triggers; the win). Then **BANDAI'S RULES**: the rules page, the one-page overview sheet, the rule manual, the comprehensive rules, the official channel — each a row with a short note and an outbound mark. Closing line repeats the Standard / Extra sentence and links to Decks. Reached from Decks home (`New to the game? Learn to play in five sentences, then Bandai's rules.`) and from the Standard sentence in the builder. Copy is a Code draft for Design; the five sentences must stay ours and stay five.

## Decisions for approval
1. Starter decks as rows under the boosters (not tiles, not a separate tab or toggle).
2. Deck names as TCGplayer's group names without the prefix.
3. One outbound Limitless link per card, link-first; no counts, no scraping.
4. `/learn` reached from Decks home and the builder only (Phase 8 adds the Start here door).
5. The five sentences as drafted, pending Design's wording.

## Later
Open a starter deck as a ready deck in the builder once copies per card exist in the data; JP deck names; Bandai's events page (7.6).

## Out of scope
Sealed prices for decks in S$ (5.4), deck-box art beyond the TCGplayer render, tutorial content of our own beyond five sentences.

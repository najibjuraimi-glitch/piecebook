# Piecebook development map

As of: 16 Oct 2026 SGT. Owner: Jib. Task table of record: `docs/growth-map.csv` (every row below has a matching row there). Objective and pillars: `docs/OBJECTIVE.md`. How work runs: `docs/HANDOFF.md`.

## The short version, for Jib

Piecebook is now private, synced to the cloud, and can read a card from a photo. Two of your agents use it every day: **Auction** (the eBay and Goldin desk) and **Cards** (the Singapore buying desk). Both sent in their wish lists. This map folds those lists into the plan, with duplicates merged and the order set by what gives the most value soonest and by what has to exist before the next thing can.

What comes next, in order:

1. **One street price for everything (Phase 14).** Both agents asked for the same thing in two different shapes: "what is this card worth today". One endpoint answers both, in US dollars and Singapore dollars, with the source link and the date. The first version uses TCGplayer market prices (the same daily feed the app already trusts). PriceCharting graded prices and eBay sold comps plug into the same endpoint once you decide to pay for a key. Street price goes first because the max-bid calculator, the hunting list and the ledger all need it.
2. **Cheaper photo reads for the desks (still Phase 14).** A one-photo "what card is this" call that does not spend a full pre-grade, with its own daily cap. Plus a fix for a real bug Cards found: a 448 pixel photo was read as the wrong card and the app still suggested matches.
3. **Buying math and a ledger (Phase 15).** A max-bid calculator that both desks and the phone share, a PSA cert lookup, and one purchase ledger that goes from "won" to "sold" with paid, GST, forwarding, all-in, shipping status and tracking. This replaces the spreadsheet.
4. **Better photo reads (Phase 16).** A confidence level in the API answer, glare handling, and reading an eBay listing URL directly. Centering ratios already show on every pre-grade result and in the `/check` answer since the quick fix in PR #42.
5. **Later.** A pre-order link on product pages needs your call first, because Piecebook never sells.

The guardrails do not move:

- **No grade guesses.** Photos can rule out a PSA 10. They never confirm one. Nothing on this map outputs "this is a 10" or a grade probability as a promise.
- **Piecebook never buys, bids or offers.** The max-bid calculator returns numbers. A human or an agent acting under its own rules places the bid.
- **No invented data.** Every price carries its source URL and the date it was pulled. If a source cannot be read, the answer says "unavailable" and names why. Nothing manual.

Sizes: **S** is under a day of Code's time, **M** is one to three days, **L** is a week or more. "Benefits" names who gains: **Auction**, **Cards**, **Jib** (on the phone), or **all**.

## How the feedback was merged

| Asked by | Request | Lands as |
| --- | --- | --- |
| Auction 1, Cards 1 | Street price API, two different shapes | 14.1, one endpoint that accepts both shapes |
| Cards 2 | Cheap one-photo identify with its own cap | 14.2 |
| Found by Cards | EB02-010 read as EB02-001 on a 448 px photo, matches still suggested | 14.3 |
| Cards 3 | Watchlist as the hunting list, write back a seen listing | 14.4 |
| Auction 2 | Max-bid calculator, one shared formula | 15.1 |
| Auction 3 | PSA cert lookup, cached | 15.2 |
| Auction 4, Cards 4 | Won-item tracker, portfolio parity with the sheet, validation | 15.3 and 15.4, one ledger |
| Auction 5 | `/api/check` returns centering and confidence | Centering shipped in PR #42 (quick fix, 16 Oct); confidence is 16.1 |
| Cards 5 | Glare: retake at an angle, or two photos | 16.2 |
| Auction 5 | `/api/check` accepts an eBay item URL | 16.3 |
| Auction nice to have | Pre-order or buy link on product pages | Later, decision for Jib |

Things not on this map because they would break a guardrail: a "likely grade" output, automatic bidding of any kind, or a price that has no source behind it.

## Phase 14 · Street price and cheap reads for the desks

Goal: the agents stop guessing what a card is worth and stop spending a full pre-grade to learn a card number.

### 14.1 Street price endpoint, one shape for both desks

- **User value:** "What is EB02-010 alt art worth today, in US and Singapore dollars, and where did that number come from?" answered in one call.
- **Shape:** `GET /api/price?card=EB02-010&variant=alt&lang=EN&grade=raw`. Also accepts Cards' spelling (`code=`, `grade=psa10`) and Auction's (`variant=SP`, `grade=PSA10`). Returns the matched print, each source as its own block with `status`, `usd`, `sgd`, `asOf`, `pulledAt`, `source` and `url`, a dated FX block, and a single headline `street` figure when a source supports it. A source that cannot be read says `unavailable` or `not_configured` and names the reason.
- **Sources, in this order:** TCGplayer market via TCGCSV for raw cards (works today, no key, daily). PriceCharting for raw and graded (needs a paid API token; without it the block says `not_configured`). eBay sold comps (needs eBay developer keys and Marketplace Insights access; `unavailable` until then). Collectr publishes no API, so its block is always `unavailable`.
- **FX:** European Central Bank daily table, cached, with the date on the answer. Not a bank quote.
- **Cache:** KV, six hours for TCGCSV (it updates once a day), twelve hours for FX.
- **Size:** M. **Depends on:** Access and the service token (done), the card to TCGplayer product map the refresh already keeps. **Benefits:** Auction, Cards, Jib.
- **Guardrail:** the answer is a reference price with a source and a date. It is never an offer.

### 14.2 Cheap identify: one photo, three labels

- **User value:** Cards can ask "what card is this" from a listing photo for a fraction of a pre-grade.
- **Shape:** `POST /api/identify` with one photo. Returns card number, language and variant cue only, with confidence. Uses the minimal prompt that already exists for the recitation fallback, so no new prompt work. Own daily cap (`IDENTIFY_DAILY_CAP`, separate KV counter) so it never eats the 60 pre-grade checks.
- **Size:** S. **Depends on:** nothing new. **Benefits:** Cards, Auction.

### 14.3 Low-resolution guard: do not suggest matches from a photo that cannot be read

- **User value:** no more EB02-001 when the card is EB02-010. The bug Cards found: a 448 px photo got a warning but still produced candidate matches.
- **Change:** below the short-side threshold the app does not call the model at all and asks for a sharper photo. Between the threshold and comfortable resolution, any read card number is shown as "unsure, please confirm" and candidates are not auto-ranked by it. The Worker also returns the pixel size it saw so the agents can enforce the same rule.
- **Size:** S. **Depends on:** nothing. **Benefits:** all.

### 14.4 Hunting list: the watchlist for agents, plus a write-back for seen listings

- **User value:** Cards hunts from the same watchlist Jib stars on the phone, and leaves a trail of what it saw and at what ask.
- **Change:** document `/api/sync` keys for the watchlist (read, already works). Add one new key, `piecebook.sightings.v1`, that a read-only service token may write to and nothing else: `{ cardNumber, url, askUsd or askSgd, seenAt, source }`. The phone shows the last sighting under a watched card. The service token stays read-only for every other key.
- **Size:** S to M. **Depends on:** cloud sync (done). **Benefits:** Cards, Jib.

## Phase 15 · Buying math and the ledger

Goal: one formula and one book, shared by the phone and both desks, so the spreadsheet can retire.

### 15.1 Max-bid calculator endpoint, one shared formula

- **User value:** "Street is US$1,030. What is my max all-in and max bid on eBay, and on Goldin with the buyer's premium?" answered the same way everywhere.
- **Shape:** `GET /api/maxbid?street=1030&venue=ebay|goldin&grade=raw|psa10`. Returns max all-in and max bid in USD and SGD, the cost lines it added (Buy&Ship Portland forwarding, 9% Singapore GST, FX at the dated rate, Goldin's buyer's premium of about 22% as read per listing, never assumed), and a `sit` flag when the best available ask is more than 10% under street. The formula is the grade-worth math from Phase 11 (`src/lib/gradeWorth.ts`) moved into a shared module the Worker and the app both import. One formula, one set of tests.
- **Size:** M. **Depends on:** 14.1 for the street input, Phase 11.3 math. **Benefits:** Auction, Cards, Jib.
- **Guardrail:** it returns a number. It never places, schedules or suggests placing a bid.

### 15.2 PSA cert lookup, cached

- **User value:** paste a cert number, get grade, card and population, without opening PSA's site.
- **Shape:** `GET /api/cert/{number}`. Source: PSA's public cert verification API (needs a free PSA developer token; daily call limit). Cached in KV for 30 days because a cert does not change. Population is returned only when PSA includes it; otherwise the field says so.
- **Size:** S to M. **Depends on:** a PSA API token from Jib. **Benefits:** Auction, then Cards.

### 15.3 Purchase ledger: won to sold, one book for all three

- **User value:** Auction logs a win, Cards sees it land, Jib sees it on the phone, and nobody retypes it. This is the won-item tracker and the sheet in one.
- **Fields:** card, variant, cert when graded, venue, hammer, premium, paid, forwarding, GST, all-in (computed, never typed), status (won, paid, forwarding, landed, graded, listed, sold), tracking number and carrier, dates, sold price and fees, realised P/L. Stored as `piecebook.ledger.v1` in cloud sync so it syncs like everything else. Agents read it over `/api/sync`; writes by agents go through a scoped write (same mechanism as 14.4) so the service token can append a row without touching the collection.
- **Size:** L. **Depends on:** 14.4's scoped write, 15.1 for the all-in formula. **Benefits:** all.

### 15.4 Ledger validation that catches bad cells

- **User value:** the problems the sheet let through (a GST line without a paid line, a landed status without tracking, a sold price older than the won date) are named in words before they are saved.
- **Change:** a validation module shared by the phone form and the API write path, returning one plain sentence per problem. The import path for a backup file runs the same checks.
- **Size:** S. **Depends on:** 15.3. **Benefits:** Cards, Jib.

## Phase 16 · Better photo reads

Goal: the desks get more out of each photo without any promise about grades.

### 16.1 Confidence level, and centering measured on the server

- **Shipped first (PR #42, 16 Oct 2026):** every `/pregrade` result and the prediction log show the front and back left/right and top/bottom ratios (for example 55/45), whether centering rules a 10 out, and a note when a side could not be measured. `/check` returns the same `centering` block. The phone measures the pixels and sends the border widths with the photos; the Worker recomputes the ratios and the rule-out from them and says "not measured" when a caller sends photos alone.
- **User value, still open:** Auction gets a confidence level in the `/api/check` answer, and gets centering even when it sends photos alone with no phone in the loop.
- **Change:** `confidence` (low, medium, high) derived from resolution, model confidence and whether front and back agree. Then port the browser centering code (outline, warp, four borders, ratio) to the Worker so the API can measure a photo itself; the Worker has no pixel decoder today, so this needs a small pure-JS JPEG decoder and a CPU budget check.
- **Size:** S for confidence, L for server-side centering. **Depends on:** Phase 11.2 centering, PR #42's block. **Benefits:** Auction, Cards.
- **Guardrail:** centering can rule a 10 out. The response never says a card is a 10 or gives a probability of one.

### 16.2 Glare handling

- **User value:** a foil photo with a white glare patch asks for a second shot at an angle instead of returning "unclear".
- **Change:** when the model flags `glare` or the browser finds a blown-out region over the card, the app and the API both say so and accept a second front photo taken at an angle. The two reads are merged: identity from the clearer shot, surface flags from the union.
- **Size:** M. **Depends on:** 14.3's resolution signal. **Benefits:** Cards, Jib.

### 16.3 eBay item URL in, photos out

- **User value:** Auction pastes a listing URL and gets a check without downloading photos by hand.
- **Change:** `/api/check` accepts `{ url }` for an eBay item page, fetches the listing's gallery images from eBay's image host, picks the front and back, and runs the normal check. Caches by image hash. This is the "later on this row" of 11.1 and the first step of Phase 12's batch sweep.
- **Size:** M. **Depends on:** 14.3, 16.1 for the richer answer. **Benefits:** Auction.
- **Guardrail:** reads a listing. Never bids on it.

## Later

### Pre-order or buy link on product pages

- **Ask:** Auction wants a link to the official product page on, for example, the OP-18 box.
- **Decision for Jib:** Piecebook never buys, bids or offers, and the design rule is no marketplace chrome. A single text link to Bandai's product page is in line with the "link first" precedent from the play and events rows. An affiliate link or a price promise is not. Nothing is built until Jib says which.
- **Size:** S once decided. **Benefits:** Jib.

### Already on the map and unchanged

Phase 12 (Goldin ingest and batch sweep) stays "map only, do not build". 16.3 and 15.1 are its first two bricks. Auto PSA pop pulls and cert auto-match stay in Later · Pre-grade; 15.2 does not unpark them, because a single cert lookup is not a population feed.

## Order and dependencies at a glance

```
14.1 street price  ──►  15.1 max bid  ──►  15.3 ledger  ──►  15.4 validation
14.2 identify
14.3 low-res guard ──►  16.2 glare
                   ──►  16.3 eBay URL in
14.4 hunting list  ──►  15.3 ledger (scoped write)
15.2 cert lookup   (independent, needs a PSA token)
16.1 confidence (S), then server-side centering (L); the centering echo is shipped (PR #42)
```

## What Jib may need to add

| For | Key or decision | Where it goes |
| --- | --- | --- |
| 14.1 graded prices | PriceCharting API token (paid) | `npm run worker:secret -- PRICECHARTING_TOKEN` |
| 14.1 sold comps | eBay developer keys and Marketplace Insights access | Worker secrets, later |
| 15.2 | PSA developer token (free tier) | Worker secret `PSA_TOKEN` |
| Later | Pre-order link: yes as a plain link, or no | A sentence in chat |

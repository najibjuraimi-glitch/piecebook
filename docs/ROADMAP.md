# Piecebook development map

As of: 18 Oct 2026 SGT. Owner: Jib. Task table of record: `docs/growth-map.csv` (the Phase 14–16 rows below still have a matching row there). Objective and pillars: `docs/OBJECTIVE.md`. How work runs: `docs/HANDOFF.md`.

## The short version, for Jib

Piecebook is now private, synced to the cloud, and can read a card from a photo. Two of your agents use it every day: **Auction** (the eBay and Goldin desk) and **Cards** (the Singapore buying desk). Both sent in their wish lists. This map folds those lists into the plan, with duplicates merged and the order set by what gives the most value soonest and by what has to exist before the next thing can.

Shipped since the 16 Oct map:

- **Singapore day (#63, #64).** Alerts, holdings and the watchlist use the Asia/Singapore calendar day, on the Worker and on the phone. A phone outside Singapore does not send a snapshot date the Worker rejects. Stale and hit agree between midnight and 8am SGT.
- **Prints panel (#65).** Every Portfolio holding and every Watchlist item has a collapsed list of the seed prints of that card number, with the pin, the English stored price (source and date, or "no price"), and any Japanese figure labeled JP and not used as the value.
- **All-in and max bid (#67).** The phone page `/bid`. Hammer, premium, payment fee, shipping, forwarder, a typed rate with its date, and GST Auto above S$400. The reverse side solves the max hammer. It does not fetch a rate or a price, and it does not place a bid. Formula: `docs/ALL-IN.md`.

What comes next, in order:

1. **Case scan.** One photo of a dealer case or a binder page. The existing vision Worker finds every card and reads the price stickers. Each card shows its English street price, with source and date, stale flagged, or "no price" when unknown, next to the sticker. Cards under street are highlighted. Test it on raw eBay and Carousell dealer-case photos. Depends on price coverage (item 3).
2. **Watch row language (Auction V2).** A language field on the watch row, so the EN tag on `/bid` is stored data and not a label the page assumes.
3. **English price source, free.** The coverage the case scan and the indexes need. No paid key.
4. **Set index and portfolio index.** Base 100 on a stated date. Ranges 1W, 1M, 3M and ALL. The book is a second line. A minimum-data rule says when there is not enough history to draw the line.
5. **Character indexes.** Raw against PSA 10, and movers.
6. **Grading tracker.** Photos from before the card is sent off, a status timeline, and the grading cost added into the landed cost.
7. **PSA 9 crack calculator, and an English-only cert gate (Auction).**

Phases 14–16 below stay written down. They are not this queue. The max-bid page in 15.1 has shipped. The street-price endpoint in 14.1 has not. Item 3 is a free English source for the case scan and the indexes. It is not the paid PriceCharting or eBay blocks in 14.1.

The guardrails do not move:

- **No grade guesses.** Photos can rule out a PSA 10. They never confirm one. Nothing on this map outputs "this is a 10" or a grade probability as a promise.
- **Piecebook never buys, bids or offers.** The max-bid calculator returns numbers. A human or an agent acting under its own rules places the bid.
- **No invented data.** Every price carries its source URL and the date it was pulled. If a source cannot be read, the answer says "unavailable" and names why. Nothing manual.

Sizes: **S** is under a day of Code's time, **M** is one to three days, **L** is a week or more. "Benefits" names who gains: **Auction**, **Cards**, **Jib** (on the phone), or **all**.

## How the feedback was merged

| Asked by | Request | Lands as |
| --- | --- | --- |
| Auction 1, Cards 1 | Street price API, two different shapes | 14.1, one endpoint that accepts both shapes |
| Jib | TAG-style scores on /pregrade: centering, corners, edges, surface, overall range, confidence | 14.2 |
| Cards 2 | Cheap one-photo identify with its own cap | 14.3 |
| Found by Cards | EB02-010 read as EB02-001 on a 448 px photo, matches still suggested | 14.4 |
| Cards 3 | Watchlist as the hunting list, write back a seen listing | 14.5 |
| Auction 2 | Max-bid calculator, one shared formula | 15.1, shipped as `/bid` in PR #67 |
| Auction 3 | PSA cert lookup, cached | 15.2 |
| Auction 4, Cards 4 | Won-item tracker, portfolio parity with the sheet, validation | 15.3 and 15.4, one ledger |
| Auction 5 | `/api/check` returns centering and confidence | Centering shipped in PR #42 (quick fix, 16 Oct); confidence is 16.1 |
| Cards 5 | Glare: retake at an angle, or two photos | 16.2 · guided camera with glare retry in draft (keeps the cleaner shot; merging reads still open) |
| Auction 5 | `/api/check` accepts an eBay item URL | 16.3 |
| Auction nice to have | Pre-order or buy link on product pages | Later, decision for Jib |
| Cards | Prints of one card number on a holding or a watch row | Shipped, PR #65 |
| Auction | All-in and max hammer on the phone | Shipped, `/bid`, PR #67 |
| Jib | Singapore day for stale, hit and the snapshot | Shipped, PR #63 (Worker) and PR #64 (phone) |

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

### 14.2 Scores on /pregrade, TAG style: centering, corners, edges, surface, and a range

- **User value:** Jib and both desks get a score per card the way TAG and Digital Grading show one: a centering subscore from the measured ratios with the detected borders drawn on the photo, corners, edges and surface out of 10 from the model's severity per part, and an overall range such as 8 to 9.5 instead of one number. Every score carries a confidence level.
- **Change:** the model returns a strict severity enum (none, light, moderate, heavy, unclear) and a confidence enum per part; the Worker maps them and the centering block to subscores in a shared module the app also uses, and returns a `scores` block in `/check`. Centering maps the measured ratios to PSA's published centering standards (source cited in code; the house 55/45 front rule stays the limit for a 10). Confidence is marked low when a photo is under 800px, angled, or the model flags glare.
- **Size:** M. **Depends on:** PR #42's centering block, Phase 11.2. **Benefits:** Jib, Auction, Cards.
- **Guardrail:** everything is labelled an AI estimate, never a grade. A 10 is still said to be ruled out when it is; a 10 is never confirmed, so the top of a range reads "10 not ruled out". The daily cap and refund stay as they are.

### 14.3 Cheap identify: one photo, three labels

- **User value:** Cards can ask "what card is this" from a listing photo for a fraction of a pre-grade.
- **Shape:** `POST /api/identify` with one photo. Returns card number, language and variant cue only, with confidence. Uses the minimal prompt that already exists for the recitation fallback, so no new prompt work. Own daily cap (`IDENTIFY_DAILY_CAP`, separate KV counter) so it never eats the 60 pre-grade checks.
- **Size:** S. **Depends on:** nothing new. **Benefits:** Cards, Auction.

### 14.4 Low-resolution guard: do not suggest matches from a photo that cannot be read

- **User value:** no more EB02-001 when the card is EB02-010. The bug Cards found: a 448 px photo got a warning but still produced candidate matches.
- **Change:** below the short-side threshold the app does not call the model at all and asks for a sharper photo. Between the threshold and comfortable resolution, any read card number is shown as "unsure, please confirm" and candidates are not auto-ranked by it. The Worker also returns the pixel size it saw so the agents can enforce the same rule.
- **Size:** S. **Depends on:** nothing. **Benefits:** all.

### 14.5 Hunting list: the watchlist for agents, plus a write-back for seen listings

- **User value:** Cards hunts from the same watchlist Jib stars on the phone, and leaves a trail of what it saw and at what ask.
- **Change:** document `/api/sync` keys for the watchlist (read, already works). Add one new key, `piecebook.sightings.v1`, that a read-only service token may write to and nothing else: `{ cardNumber, url, askUsd or askSgd, seenAt, source }`. The phone shows the last sighting under a watched card. The service token stays read-only for every other key.
- **Size:** S to M. **Depends on:** cloud sync (done). **Benefits:** Cards, Jib.

## Phase 15 · Buying math and the ledger

Goal: one formula and one book, shared by the phone and both desks, so the spreadsheet can retire.

### 15.1 Max-bid calculator — shipped as `/bid` (PR #67, 18 Oct 2026)

- **Shipped:** the phone page `/bid`, shared by the book and both desks. Hammer and currency, buyer's premium (eBay 0%, Fanatics 20%, Goldin 22%, or custom), a payment fee that follows the house until it is overridden (eBay 0%, Fanatics card 2.9%, Goldin ~3%), seller shipping, a forwarder fee in S$, a rate to S$ typed with the day it was read, and GST Auto (9% only when the import is over S$400, with On and Off overrides). The reverse side solves the highest hammer, to the cent, that stays inside a target all-in. A watch row can open it; the target is the row's target, or 0.9 times a fresh manual English figure. Fanatics shipping fills in only inside the verified US$750–3,000 band. The formula and the tests live in `docs/ALL-IN.md` and `src/lib/allIn.ts`.
- **Not built:** the `GET /api/maxbid` shape below. There is no street-price input yet, and no `sit` flag. The page does not fetch a rate.
- **Guardrail:** it returns a number. It never places, schedules or suggests placing a bid.

The old endpoint note, kept so the unpaid shape is not forgotten:

- **Shape that was not built:** `GET /api/maxbid?street=1030&venue=ebay|goldin&grade=raw|psa10`. It would have returned max all-in and max bid in USD and SGD from a street figure, with Buy&Ship Portland forwarding, 9% Singapore GST, FX at the dated rate, and Goldin's premium as read per listing. A `sit` flag when the best available ask is more than 10% under street. Depends on 14.1, which is still open. Item 3 in the queue above is the free English source; it is not this endpoint.

### 15.2 PSA cert lookup, cached

- **User value:** paste a cert number, get grade, card and population, without opening PSA's site.
- **Shape:** `GET /api/cert/{number}`. Source: PSA's public cert verification API (needs a free PSA developer token; daily call limit). Cached in KV for 30 days because a cert does not change. Population is returned only when PSA includes it; otherwise the field says so.
- **Size:** S to M. **Depends on:** a PSA API token from Jib. **Benefits:** Auction, then Cards.

### 15.3 Purchase ledger: won to sold, one book for all three

- **User value:** Auction logs a win, Cards sees it land, Jib sees it on the phone, and nobody retypes it. This is the won-item tracker and the sheet in one.
- **Fields:** card, variant, cert when graded, venue, hammer, premium, paid, forwarding, GST, all-in (computed, never typed), status (won, paid, forwarding, landed, graded, listed, sold), tracking number and carrier, dates, sold price and fees, realised P/L. Stored as `piecebook.ledger.v1` in cloud sync so it syncs like everything else. Agents read it over `/api/sync`; writes by agents go through a scoped write (same mechanism as 14.5) so the service token can append a row without touching the collection.
- **Size:** L. **Depends on:** 14.5's scoped write, 15.1 for the all-in formula. **Benefits:** all.

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
- **Size:** M. **Depends on:** 14.4's resolution signal. **Benefits:** Cards, Jib.
- **Guided camera (draft PR, 17 Oct 2026):** `/pregrade` gets a "Use camera" option beside upload: rear camera, a 63 × 88 outline, live hints read from the frames on the phone (no card, off-frame, too far or close, tilted, rotated, dark, blur, glare), auto-capture after half a second steady plus a manual shutter, flash off. The shot is flattened from its four corners before it is measured, so a slightly angled photo still reads; when the corners are not found the raw frame is kept and the collector is told centering may be less accurate. Glare asks for a second, tilted shot and keeps the cleaner one, saying which. Still open from this row: merging two shots' reads (identity from one, surface flags from both), and the API side of the retry.

### 16.3 eBay item URL in, photos out

- **User value:** Auction pastes a listing URL and gets a check without downloading photos by hand.
- **Change:** `/api/check` accepts `{ url }` for an eBay item page, fetches the listing's gallery images from eBay's image host, picks the front and back, and runs the normal check. Caches by image hash. This is the "later on this row" of 11.1 and the first step of Phase 12's batch sweep.
- **Size:** M. **Depends on:** 14.4, 16.1 for the richer answer. **Benefits:** Auction.
- **Guardrail:** reads a listing. Never bids on it.

## Later

### Pre-order or buy link on product pages

- **Ask:** Auction wants a link to the official product page on, for example, the OP-18 box.
- **Decision for Jib:** Piecebook never buys, bids or offers, and the design rule is no marketplace chrome. A single text link to Bandai's product page is in line with the "link first" precedent from the play and events rows. An affiliate link or a price promise is not. Nothing is built until Jib says which.
- **Size:** S once decided. **Benefits:** Jib.

### Already on the map and unchanged

Phase 12 (Goldin ingest and batch sweep) stays "map only, do not build". 16.3 is still a brick for it. The buying-math brick shipped as `/bid` (PR #67), not as Goldin ingest. Auto PSA pop pulls and cert auto-match stay parked; 15.2 does not unpark them, because a single cert lookup is not a population feed. Item 7 in the queue is a PSA 9 crack calculator and a gate that keeps a non-English cert out. It is not a population feed.

## Order and dependencies at a glance

```
Done: Singapore day (#63, #64). Prints panel (#65). /bid all-in and max hammer (#67).

English price source (free) ──► case scan
                           ──► set + portfolio index ──► character indexes, raw vs PSA 10, movers
Watch row language (independent; makes the EN tag on /bid real)
Grading tracker (photos, status, grading cost into landed cost)
PSA 9 crack calculator + English-only cert gate

Still written below, not this queue:
14.1 street-price endpoint (paid sources are a later plug-in, not item 3)
14.2 scores ──► 16.1 confidence in the API
14.3 identify
14.4 low-res guard ──► 16.2 glare
                   ──► 16.3 eBay URL in
14.5 hunting list  ──► 15.3 ledger ──► 15.4 validation
15.1 phone calculator is shipped; GET /api/maxbid is not
15.2 cert lookup (needs a PSA token; the cert gate above is separate)
16.1 confidence (S), then server-side centering (L); the centering echo is shipped (PR #42)
```

## What Jib may need to add

| For | Key or decision | Where it goes |
| --- | --- | --- |
| 14.1 graded prices | PriceCharting API token (paid) | `npm run worker:secret -- PRICECHARTING_TOKEN` |
| 14.1 sold comps | eBay developer keys and Marketplace Insights access | Worker secrets, later |
| 15.2 | PSA developer token (free tier) | Worker secret `PSA_TOKEN` |
| Later | Pre-order link: yes as a plain link, or no | A sentence in chat |

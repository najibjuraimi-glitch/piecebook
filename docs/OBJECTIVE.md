# Piecebook — Objective and pillar matrix
As of: 5 Sep 2026 SGT  
Owner: Jib  
Pinned copy also lives in ClickUp: Team Space › Piecebook › "Piecebook — Objective and pillar matrix (pinned)".

## Objective
**Piecebook is an all-in-one platform for a human being to become a One Piece card collector, a One Piece card player, and a member of the One Piece fandom.**

Every phase, task and design call is checked against these three pillars. Still true from the design pack: quiet paper, ink, one accent for primary CTAs, no marketplace chrome, no invented data. Sets (box › cards) stays home; search, watchlist, movers and decks are the cross-cuts into that tree.

## Pillar matrix
Bold entries were added after the audit on 5 Sep 2026; before them the map was a collector's map.

| Phase | Collector | Player | Fandom |
| --- | --- | --- | --- |
| 0 Foundation (pipeline, CI, backfill) | Yes | Indirect | Indirect |
| 1 Card page | Variants, change-since, chart, How prices work | **1.0 attribute capture · 1.6 Play block** | **1.7 Illustrated by** |
| 2 Find anything | Name / number search, jump-to-number | **2.3 colour / category / cost / trait / effect facets** | **2.4 Character view** |
| 3 Sealed as a product | Box card, price line, box art | — | Box art is the fandom object too |
| 4 Portfolio and watchlist | Movers, since-starred, set completion | **4.4 Playsets** | — |
| 5 Depth | SG asks, collections, graded, currency | — | — |
| **6 Play** | 6.3 deck gap priced from the collection | **6.1 decks home · 6.2 deck builder · 6.4 legality · 6.5 starter decks · 6.6 tournament decks link · 6.7 learn to play** | — |
| **7 Belong (fandom)** | 7.2 timeline, 7.5 upcoming sets, 7.11 countdown | 7.3 artists | **7.1 set stories · 7.2 release timeline · 7.3 artists · 7.4 characters + watch · 7.5 upcoming sets · 7.6 official events · 7.7 wiki pipeline · 7.8 Who is / Born · 7.9 On This Day · 7.10 Today's card (stood down) · 7.11 countdown** |
| **8 Start here** | Collect door | Play door | Belong door |

## Order of work
Jib's call (5 Sep 2026): collector objective first (Phases 0 → 1 → 2 → 3 → 4), with 1.0 (attribute capture) pulled forward because it is a one-day pipeline change that unlocks both other pillars; then Play (6), Belong (7), Start here (8).

## Decisions taken
- 1.0 — Bandai's card text is shown as every card database shows it (Jib, 5 Sep 2026).
- 3.1 — Box price feed: automated. Every EN booster box's TCGplayer market price is pulled daily by the Seed refresh workflow from TCGCSV (tcgcsv.com, a once-a-day public mirror of TCGplayer's own API, used within its published guidelines: identified User-Agent, one pull a day, back-end only) and appended to `data/box-price-history.csv`; the roster names each box by `tcgplayerProductId` / `tcgplayerGroupId`. No hand reads: the roster's 4 Sep 2026 figures are only a fallback, and `seed:check` warns if the feed goes quiet for 3 days. Limitless lists no sealed products, and reading TCGplayer's site directly stays ruled out. This is how Collectr does it at its core — TCGplayer market daily — minus the eBay / Cardmarket blending we cannot license. (Jib: "anything manual should not be considered"; decided by Code as interim Cards, 5 Sep 2026.)
- 5.1 — SG asks for the other 20 boxes: closed as superseded (Jib, 5 Sep 2026). The SG ask was a hand-read Carousell figure with no automated source; since 3.1 / 3.2 every box price is TCGplayer market, read daily, and the SG line is retired from the UI. Nothing manual is added to the data.
- 5.4 — Currency display: built 6 Sep 2026. Portfolio only. `US $` / `S$` chips, remembered, default US $. S$ is the USD seed at the dated ECB cross (`data/fx-usd-sgd.json`, EUR/SGD ÷ EUR/USD). Costs never convert. P/L stays in US dollars on both tabs. Amends the PRD's no-FX line: no invented rates; a dated central-bank table is not a bank quote.
- 5.2 (multiple collections) and 5.3 (graded prices, population) stay parked: nobody in the research asked for 5.2; 5.3 has no free licensed source (PriceCharting's paid API or PSA's population data would need a budget decision first).

## Hypotheses, not taken as given
- 10.0 — Malaysia and Indonesia (Jib, 6 Sep 2026; Jib: do not take his word). Next-phase interest only: ringgit, rupiah, and language translation *may* matter. Seat collectors in those markets in the next research round before any map row besides this decision opens.
- 11.0 — Fandom is the thin pillar (Jib, 6 Sep 2026; Jib: challenge him). He then asked for a dedicated Belong page into collect and play. No chapter or anime summaries. No wiki portal. No fifth tab. First candidate: `/belong` from shipped surfaces. See `docs/V1-FANDOM-REEVAL.md`.

## Decisions parked on the board
- 6.1 — where decks live (fourth tab vs under Collection)
- 6.5 — starter decks on Cards' roster
- 6.6 — decklists: link only, or import as a source

## Task list
`docs/growth-map.csv` holds every task (50 rows) with phase, pillars, owner, dependencies, priority and whether it exists in ClickUp yet. Rows marked `NO` (10.0, 11.0) or `NO (quota)` (7.6 events) are not in ClickUp; do not create 10.0 or 11.0 until research asks. 5.4 and 9.1 shipped 6 Sep 2026 as PR #26. The dependencies to wire are in the `Depends on` column.

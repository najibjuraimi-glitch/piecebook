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
| **7 Belong (fandom)** | 7.2 timeline, 7.5 upcoming sets | 7.3 artists | **7.1 set stories · 7.2 release timeline · 7.3 artists · 7.4 characters + watch · 7.5 upcoming sets · 7.6 official events** |
| **8 Start here** | Collect door | Play door | Belong door |

## Order of work
Jib's call (5 Sep 2026): collector objective first (Phases 0 → 1 → 2 → 3 → 4), with 1.0 (attribute capture) pulled forward because it is a one-day pipeline change that unlocks both other pillars; then Play (6), Belong (7), Start here (8).

## Decisions parked on the board
- 1.0 — showing Bandai's card text (standard practice among card databases; accept explicitly, as with images)
- 3.1 — box price feed (Cards cadence vs TCGPlayer box reads)
- 6.1 — where decks live (fourth tab vs under Collection)
- 6.5 — starter decks on Cards' roster
- 6.6 — decklists: link only, or import as a source

## Task list
`docs/growth-map.csv` holds every task (43 rows) with phase, pillars, owner, dependencies, priority and whether it exists in ClickUp yet. Rows marked `NO (quota)` in the `In ClickUp` column (7.1–7.6, 8.1) still need creating; the dependencies to wire are in the `Depends on` column.

# Piecebook — V1 Movers, change since starred, set completion, playsets (Design addendum — DRAFT)
As of: 5 Sep 2026 SGT  
Owner: Code (draft for Jib / Design approval; not yet built for merge)  
For: Design (review), Code (implement once approved)  
Amends: `V1-COST-AND-PORTFOLIO-UI.md` § Portfolio; `V1-WATCHLIST-AND-CHARTS.md` § Watchlist; `V1-SETS-ROSTER-UI.md` § Sets home; `V1-OWN-AND-SET-DEPTH-UI.md` § Thin Own; `V1-DESIGN-PACK.md` § Collection (“no filters in V1” is lifted for one Playsets view)  
Growth map: 4.1, 4.2, 4.3, 4.4

## Why
Portfolio and watchlist should answer the questions a collector actually asks: what moved, has the card I starred moved since, how much of a set do I hold, and (for the player) do I hold four. Everything below is computed in the browser from the dated seed points already in `data/price-history/` and the local collection; no new data, no live prices, no percentages.

## Tokens
Unchanged. Paper, ink, muted, line; `--good` / `--bad` only on the signed figure, as on card detail. No accent anywhere in this addendum.

## 4.1 Movers — Portfolio
Placement: after the three StatBlocks and their footnote, before **Top owned**. Also shown when nothing is owned but cards are watched (under the empty state).

- Heading **MOVERS** (section meta style) with two text chips on the right: **Week** · **Month** (ink when selected; same chips as the chart ranges). Default Week.
- Two quiet lists, **Up** and **Down**, side by side from tablet up, stacked on phone. Up to five rows each.
- Row: art thumbnail · `Name · Variant` · `OP09-062p1` plus `· ×4` when more than one is owned or `· watching` when the card is only starred · right-aligned signed change `+$34.44` (good / bad) with `since 24 Aug 2026` muted beneath. Tap → card detail.
- Universe: every card the collector owns or watches, each once.
- Reference point: the newest dated point at least a week (or a month) older than the latest, exactly as the card page’s change-since line. With weekly points that can reach back up to 13 days, which is why the chips say Week / Month rather than 7 / 30 days, and why every row states its own date.
- Floor: moves under **$0.10** are not listed; a cent on a six-cent common is not a mover.
- Empty: **Nothing has moved much this week.** (or *this month*). Nothing shown while history loads.

## 4.2 Change since starred — Collection › Watching
On each watched card cell, under the market figure: `−$1.35 since 17 Aug 2026`, signed figure in good / bad, the rest muted. Reference: the newest dated point on or before the day the star was set. No line when the card has not moved since, when no point that old exists, or when the card has no seed price. Watched sets get nothing new (box prices are one dated point).

## 4.3 Set completion — set detail and tile
- Set detail: a third header line under the set name, in ink: **You own 6 of 151**. Only when at least one card is owned.
- Set tile: the count line becomes `151 cards in seed · you own 6`, the owned part in ink. Only when at least one card is owned; other tiles are unchanged.
- Counting: distinct owned prints among the set’s checklist. A reprint owned once counts for its home set and for the PRB checklist that lists it.

## 4.4 Playsets — card detail and Collection
- Card detail, under the Owned row with the Qty stepper: `2 of 4 for a playset`, or **Playset complete** at four or more. Leaders are one per deck and get no line.
- Collection: the **OWNED** heading gains two text chips on the right, **All** · **Playsets**. Playsets shows only cards held four or more times (leaders excluded) with a muted count line `2 playsets · 4 or more copies`; empty: `No playsets yet. 4 copies of a card make one.` Nothing else about Collection changes.

## Decisions for approval
1. Movers sit between the footnote and Top owned (not above the stats).
2. Chips read **Week / Month**; each row carries its exact `since` date.
3. Floor of $0.10 on listed moves.
4. Watched cells stay silent on zero movement.
5. Playsets exclude leaders and list complete sets only; progress (`2 of 4`) lives on the card page, not on cells.

## Out of scope
Percent change, sparklines, alerts, sorting the Collection grid, playset counts on cells, box-price movement.

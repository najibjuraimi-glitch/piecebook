# Piecebook V1 — Currency display and data health
(Design addendum, v2 after user research: ten simulated reviewers, 6 Sep 2026)

Owner: Code as interim Cards, drafted from rendered mockups and ten simulated user reviews  
For: Code (implement), Design (critique)  
Covers growth-map 5.4 (currency display switch) and 9.1 (weekly data health)  
Reads with: `V1-DESIGN-PACK.md`, `V1-COST-AND-PORTFOLIO-UI.md`, `V1-BOX-CARD-AND-ART-UI.md`, `AboutPrices`, `seed-sources.md`

Two automations, one screen each. An S$ figure is a dated reading from the European Central Bank's euro table applied to a USD seed price. A health figure is a count from the files. A gap is named, not filled.

## Why these together
Phase 6 research: 3 of 10 users thought in Singapore dollars and stumbled on a bare `$`. The PRD's "no FX" meant no invented rates. A dated central-bank table, pulled by the refresh, is not a bank quote. Jib re-opened 5.4 on 5 Sep 2026.

9.1 is the other unfinished automation: checks already fail the build and warn, but the warnings live in CI logs. A weekly page names the gaps in words.

## 5.4 Currency display
**Source.** European Central Bank euro foreign-exchange reference rates, `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`, no key. The table is EUR-based. SGD per USD is the cross from the same daily cube: EUR/SGD ÷ EUR/USD. First pull 4 Sep 2026 (Friday): 1 EUR = 1.1622 USD and 1.4724 SGD, so **S$1.2669 to US $1**. That cross is arithmetic on two published legs, not a published USD/SGD pair and not a bank quote. MAS publishes a direct USD/SGD series and would be preferred for an SG reader; its public APIs were down or stale on 6 Sep 2026. ECB is the source we can pull today. The cache stores both legs so the cross is auditable.

**Cache.** `data/fx-usd-sgd.json`, written by the daily refresh. `seed:check` fails a missing rate or a file older than 4 weekdays (the table is not published on TARGET holidays). User-Agent `Piecebook/1.0`, one pull a day. Never invent a Saturday or Sunday print.

**Where.** One screen: Portfolio. Chips `US $` / `S$` at the title, same ViewTabs as Tiles / Timeline. Preference in `piecebook.displayCurrency.v1` (remembered). Default `US $` so a first visit matches today's live page.

**What, on S$.** Market value and Top owned convert at the cached rate, 2 decimal places. One subline on Market, in ink: `S$1.2669 to US $1 · European Central Bank · 4 Sep 2026`. One sentence under the stats, in ink: `A reading from the euro table, not a bank quote and not a local ask.` Cost basis stays in the currency paid. A USD cost sitting next to an S$ figure is written `US $20.00`, never a bare `$`.

**P/L stays in US dollars on both tabs.** It is only USD costs against USD market. Dressing that number as `+S$7.34` made seven of ten readers think the household was up after they had paid S$175 that is not in the math. The figure stays `+$5.79` with `US costs against US market only. What you paid in S$ is not in this figure.` If the only costs on the book are SGD, P/L is still a dash (today's rule).

**What stays US $ even if the switch is S$.** Card cells, movers, the chart, box tiles, the card Market line. The switch is a Portfolio reading. Top owned on this screen follows the switch because it is the same reading.

**About prices.** Amend "Piecebook does not convert": costs never convert; a Portfolio S$ figure is the USD seed at the last European Central Bank table, dated; it is not a bank quote and not a Singapore ask.

**Not taken.** A live quote. A bank / Wise / card-network rate. Converting SGD costs so P/L can include them. Showing S$ on every cell. Inventing a weekend rate. A yen market figure (Tokyo asked to log yen as a cost later; no JPY rate). MAS until its API returns a dated USD/SGD again. Ringgit and rupiah (and any translation) are a later-phase hypothesis — map 10.0 — not this addendum; do not take them as given until collectors in Malaysia and Indonesia ask.

## 9.1 Weekly data health
**Where.** `/data`, reached from How prices work. One screen.

**What, in this order (phone fold):**

1. Warnings this week — `None.` or the warning sentences.
2. Unpriced prints, named, each a link. Today: three (`EB04-061p3`, `OP17-118p2`, `OP05-115p1`). Print IDs in ink.
3. Left out on purpose — including `SG asks are not shown: there is no automated Singapore source.`
4. The catalogue — print count, file count, three dated facts: card prices, box prices, character lines. Calendar days only; never `today`, never `N days old`.

No percent badges. No traffic-light score. No `seed:check`, CI, or "repo" on the page.

**Automation.** Daily refresh writes `data/health.json`. The page is the weekly read. `seed:check` warns if the file is more than 8 days old.

**Not taken.** A public status badge. Email. A GitHub issue per warning. A health score. Relative ages that read as a shop clock.

## Surfaces (draft)
Prototyped on `/currency-preview` and `/health-preview` only. Live `Portfolio.tsx`, `AboutPrices.tsx` and the refresh script are not edited until this addendum is approved.

## Research → response (ten reviewers: SG collector who thinks in S$, US collector, Tokyo JP/EN collector, copy editor, product designer, phone reader, budget parent, low-vision collector, data-trust auditor, Singapore store owner)

| Heard (of ten) | Response |
|---|---|
| 7 — Green `+S$7.34` looks like the household is up; S$175 is not in it | P/L stays in US $ on both tabs. Same sentence: what you paid in S$ is not in this figure |
| 5 — `ECB` unexplained; "official" / "same day" is false on a Sunday | Spell European Central Bank. Date the Friday table. Never say official or same day for the cross |
| 4 — Phone first screen is disclaimers; health all-clear and "left out" sit under the tab bar | One rate line. Health leads with warnings, unpriced, left out; catalogue dates last |
| 4 — Bare `$` still on the S$ page (cost $20.00) | `US $20.00` beside an S$ figure |
| 3 — S$ on Top owned / Portfolio will be screenshotted as a shop price | "Not a bank quote and not a local ask" in ink under the stats. Catalogue stays US $ |
| 3 — "2 days old" / `today` is the shop clock again | Health names the calendar day only |
| 2 — `seed`, `CI`, `cross`, `TARGET`, EUR triangle on a collector face | Cut from the screens. Legs stay in the cache and on How prices work |
| 2 — Remembered S$ vs session-only | Kept remembered. Default remains US $ |
| 1 — Yen | Noted for later: yen as a cost that never converts. No JPY rate |
| — Jib, after v2: Malaysia / Indonesia may need MYR, IDR, and translation | Not this addendum. Map 10.0 is a research decision only; do not take as given |
| Split — cells follow the switch | Kept: Portfolio reading only. Top owned on this screen follows. Card Market later if asked |
| Not taken — convert SGD costs into P/L; default the app to S$; invent a weekend rate | Noted; each contradicts a non-negotiable |

## Decisions (draft — waiting for approval)
1. European Central Bank daily table as the rate source; MAS later if its API returns a dated USD/SGD. The S$ figure is a dated cross, not a published pair.
2. Portfolio is the one screen that switches. Cells, movers, charts, tiles, card Market stay US $. Top owned on Portfolio follows the switch.
3. Costs never convert. P/L stays in US dollars on both tabs.
4. Preference remembered in localStorage; default US $.
5. Data health is an in-app page of named facts and named gaps, written by the refresh, not a dashboard and not a shop clock.
6. Prototype stays off the live screens until approved.
7. This switch is `US $` / `S$` only. Ringgit, rupiah, and translation wait on map 10.0 and on collectors in those markets asking.

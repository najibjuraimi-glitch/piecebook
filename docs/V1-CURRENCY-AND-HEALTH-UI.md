# Piecebook V1 — Currency display and data health
(Design addendum, draft v1, 6 Sep 2026)

Owner: Code as interim Cards  
For: Code (implement), Design (critique)  
Covers growth-map 5.4 (currency display switch) and 9.1 (weekly data health)  
Reads with: `V1-DESIGN-PACK.md`, `V1-COST-AND-PORTFOLIO-UI.md`, `V1-BOX-CARD-AND-ART-UI.md`, `AboutPrices`, `seed-sources.md`

Two automations, one screen each. Nothing is typed by hand. Nothing is invented: an S$ figure is an official daily rate applied to a USD seed price, dated; a health figure is a count from the files in the repo.

## Why these together
Phase 6 research: 3 of 10 users thought in Singapore dollars and stumbled on a bare `$`. The PRD's "no FX" meant no invented rates. An official daily reference rate, pulled by the refresh with its date, is not invented. Jib re-opened 5.4 on 5 Sep 2026.

9.1 is the other unfinished automation: `seed:check` already fails the build and warns, but the warnings live in CI logs. A weekly page names the gaps in words — unpriced prints, stale feeds, things left out on purpose — so a collector (and Jib) can read the seed's health without opening GitHub.

## 5.4 Currency display
**Source.** European Central Bank euro foreign-exchange reference rates, `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`, no key. The table is EUR-based. SGD per USD is the cross from the same daily cube: EUR/SGD ÷ EUR/USD. First pull 4 Sep 2026: 1 EUR = US $1.1622 = S$1.4724, so **S$1.2669 to US $1**. MAS publishes a direct USD/SGD series, which would be preferred for an SG reader, but its public APIs were down or stale on 6 Sep 2026 (data.gov.sg 409; eservices.mas.gov.sg on failover). ECB is the source we can pull today. The file names both legs so the cross is auditable.

**Cache.** `data/fx-usd-sgd.json`, written by the daily refresh. `seed:check` fails a missing rate or a file older than 4 weekdays (ECB does not publish on TARGET holidays). User-Agent `Piecebook/1.0`, one pull a day.

**Where (this draft).** One screen: Portfolio. Chips `US $` / `S$` at the title, same ViewTabs as Tiles / Timeline. Preference lives in `piecebook.displayCurrency.v1` (remembered; unlike the timeline view). Default `US $` so a first visit matches today's live page.

**What, on S$.** Market value and Top owned figures convert at the cached rate, 2 decimal places. Subline on Market: `S$1.2669 to US $1 · ECB · 4 Sep 2026`. A sentence under the stats: `S$ figures use the ECB reference rate of the same day, not a bank quote. 1 EUR = US $1.1622 = S$1.4724.` Cost basis stays in the currency paid and is never converted. Unrealized P/L is still only USD costs against USD market; on S$ it is the same USD figure shown at the rate, with `USD costs against US market, shown at the ECB rate. SGD costs stay out of P/L.`

**What stays USD even if the switch is S$ (this draft).** Card cells, movers, the chart, box tiles. Those surfaces stay quiet; the switch is a Portfolio reading, not a restyle of the catalogue. If research asks for the Market line on the card and the box card to follow the switch, that is a later pass on those two lines only.

**About prices.** Amend "Piecebook does not convert" to: costs never convert; a Portfolio S$ figure is the USD seed at a dated ECB rate, named.

**Not taken.** A live quote. A bank / Wise / card-network rate. Converting SGD costs into USD (or the reverse) so P/L can include them. Showing S$ on every cell. Inventing a weekend rate when ECB has not published.

## 9.1 Weekly data health
**Where.** `/data`, reached from How prices work. One screen.

**What.** A dated report written by the same checks CI already runs, cached as `data/health.json`:

- The seed: print count, file count, card-prices `as of`.
- Box feed: newest TCGCSV day and its age in words. Warns after 3 silent days (already in `seed:check`).
- Wiki: fetched day, asked / mapped / lines / births.
- Unpriced prints, named, each a link to the card. Today: three (`EB04-061p3`, `OP17-118p2`, `OP05-115p1`).
- Left out on purpose: OP-18 has no story (no Bandai EN page); EB-04 has no English box; SG asks are not shown; wiki images are never pulled.
- Warnings this week: the `seed:check` warning list, or `None.`

No percent badges. No traffic-light score. Counts in words.

**Automation.** Daily refresh writes `health.json`. The page is the weekly read. `seed:check` warns if the file is more than 8 days old (a missed week plus a day). A Sunday Action is not required if the daily write stays current.

**Not taken.** A public status badge. Email. A GitHub issue per warning. Showing CI logs. Inventing a health score.

## Surfaces (draft)
Prototyped on `/currency-preview` and `/health-preview` only. Live `Portfolio.tsx`, `AboutPrices.tsx` and the refresh script are not edited until this addendum is approved.

## Decisions (draft — waiting for approval)
1. ECB daily table as the rate source; MAS later if its API returns a dated USD/SGD again.
2. Portfolio is the one screen that switches. Cells, movers, charts, tiles stay US $.
3. Costs never convert. P/L stays "USD costs vs USD market", optionally *shown* in S$ at the same rate.
4. Preference remembered in localStorage; default US $.
5. Data health is an in-app page of named facts, written by seed:check, not a dashboard.
6. Prototype stays off the live screens until approved.

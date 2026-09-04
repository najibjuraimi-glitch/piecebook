# Piecebook — V1 Cost basis + Portfolio (Design addendum)
As of: 4 Sep 2026 SGT  
Owner: Design  
For: Code (implement)  
Amends: `V1-DESIGN-PACK.md` § Card detail, § Collection, § Portfolio; `V1-OWN-AND-SET-DEPTH-UI.md` § Thin Own (“no cost, date or note UI” is lifted)  
Companion: `V1-SETS-ROSTER-UI.md`

Recreated in-repo from the implementation brief; wording follows the brief, nothing added. Where the brief truncates a line of copy, the copy Code shipped is marked **(Code)** so Design can replace it.

## Why
Collectors want to remember what they paid and see, quietly, how that compares with the seed market. Keep it honest: no live prices, no FX, no charts, no nag. Affiliates stay parked.

## Tokens
paper `#F7F5F0` · surface `#FFFFFF` · ink `#1A1A1A` · muted `#6B6560` · line `#E6E1D8` · accent `#C45C26` **only on Save cost / Mark owned**. Only one accent button on screen at a time.

## Own storage (local only)
`localStorage` key `piecebook.v1`, one entry per owned card:

```
{ cardNumber, qty, ownedAt?, cost?: { amount, currency: 'SGD'|'USD', paidOn: YYYY-MM-DD, note? } }
```

- Cost exists only while the card is owned. Removing ownership clears the cost.
- One cost per card, in the currency it was paid in. **No FX conversion. No invented rates.**

## Card detail
Under the Own block, only when owned:

| State | UI |
| --- | --- |
| Owned, no cost | Ghost **Add cost basis** → inline form: Amount paid · SGD \| USD chips (SGD default) · Date (default today) · Note (optional) · Primary **Save cost** · Ghost Cancel |
| Owned, cost saved | Summary: `S$120` / `$85.00` · `Paid D MMM YYYY` · note. Ghosts **Edit cost** · **Clear cost** (inline confirm **Clear cost?** → Clear / Cancel) |
| Not owned | No cost UI at all |

The accent is on Mark owned when not owned, and on Save cost while the form is open. Never both.

## Collection
Optional muted `Paid S$120` line under the market `$` on a cell, only when a cost exists. No nag on cells without one.

## Portfolio
1. Title **Portfolio**
2. Three StatBlocks:
   - **Market value** — Σ `market_usd × qty`, always USD.
   - **Cost basis** — all SGD → `S$…`; all USD → `$…`; mixed → two lines (SGD, USD); none → `—`.
   - **Unrealized P/L** — USD costs only, against the seed market: Σ(`market_usd × qty`) − Σ(USD cost). Green / red. If costs are SGD only → `—` + “P/L needs USD costs (seed market is USD).”
3. Footnote: **Values use Cards’ seed prices, not live market.**
4. Optional **Top owned**: up to 5 owned cards by market value; tap → card detail.

States:
- **Nothing owned** — “No owned cards yet.” + Browse sets → `/`.
- **Owned, no costs** — Market value if any price exists; Cost basis `—`; P/L `—`; subline under Cost basis: “Add what you paid on a card to see cost basis and P/L.” **(Code; brief reads “Add what you paid…”)**
- **Mixed SGD + USD costs** — Cost basis two lines; P/L over the USD-cost cards with subline “USD costs against seed market only.” **(Code)**

## Do not
Charts, fake tickers, live prices, FX conversion, affiliate or marketplace links, a second accent button.

# Piecebook — V1 Desktop Layout (Design addendum)
As of: 4 Sep 2026 SGT  
Owner: Design  
For: Code (implement)  
Amends: `V1-DESIGN-PACK.md` § Layout (“Max content width: 480px centered on larger viewports”)

## Why
V1 capped content at ~480px phone-first. On a monitor that leaves empty gutters. Jib wants monitor width. Keep the quiet collector bar. Do NOT become TCGPlayer (no banners, mega-nav, cart, seller tables, ads).

Borrow Limitless-style: art grid expands with viewport (3–5 cols), quiet chrome.

## Breakpoints
| Name | Min width | Content max | Card grid cols | Set tiles |
| --- | --- | --- | --- | --- |
| phone | default | 480px centered | 2 | 1 column |
| tablet | 768px | 720px | 3 | 2 |
| desktop | 1024px | 1100px | 4 | 2 |
| wide | 1280px | 1280px | 5 | 3 |

Below 768px: keep today’s phone shell and bottom TabBar unchanged.

## Shell ≥768px
- Grow content column per table. Paper side margins only (no second sidebar).
- Top bar: Piecebook wordmark left; text links Sets · Collection · Portfolio only. No search/cart/charts/bell.
- Hide bottom TabBar at ≥768px.
- Page padding 24px sides on tablet/desktop.

## Screens
- Sets home: responsive SetTile grid; type-first until key art.
- Set detail: one-line sealed strip full width; sticky rarity tabs; card grid uses breakpoint cols; no prices on cells; owned check only.
- Card detail: desktop two-column (left ~40% art, right meta + Market seed + Own + cost). Phone stays stacked. One accent primary CTA.
- Collection: same card grid cols as set detail.
- Portfolio: StatBlocks in a row of three from tablet up; stack on phone. No charts.

## Tokens unchanged
Paper #F7F5F0, ink #1A1A1A, accent #C45C26 for primary CTAs only. System UI stack.

## Out of scope
Search, marketplace, charts, alerts, accounts, live prices, new OP sets. Layout only.

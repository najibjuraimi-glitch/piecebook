# Piecebook — V1 PRD
Product name: **Piecebook** (locked 4 Sep 2026)

As of: 4 Sep 2026 SGT  
PM: Cards  
Builder: Code  
Monetization: Side  

## Problem
One Piece collectors bounce between Limitless, Collectr, OP.LOG, TCGPlayer, and Carousell. Nobody gives a single place to browse a set like a Pokédex, know which sealed product feeds it, and log owned cards with cost basis and portfolio value.

## Primary user
Jib (and collectors like him): SG-based, chase-aware, may flip sealed or singles, carries a phone at meetups but will use web first.

## North star (full product)
Chase-aware Pokédex, sealed guidance, price moves, Collectr-like portfolio, scan with watermark and share, watchlist/alerts, graded, condition, later trade helper and box EV.

## V1 scope (ship this only)
1. Set browser by OP number (start: OP-09, OP-16) with rarity buckets (Leader, SEC, SR, R, UC, C, parallels called out).
2. Sealed guidance per set (which booster box / case is the English vs Japanese product).
3. Collection log (mark owned).
4. Cost basis (date + price paid for a single or sealed lot).
5. Portfolio value from seed market prices × owned qty.

## V1 non-goals
- Live price API
- Charts / alerts
- Scanner / watermark / share
- Graded population
- Accounts / cloud sync
- iOS App Store
- Marketplace / trade matching
- Hunt checklist as a separate product (parked)
- Invented card lists or prices

## User stories (max 5)
1. As a collector, I open OP-09 and see cards grouped by rarity so I know what to seek.
2. As a collector, I see which sealed box/case feeds that set and language.
3. As a collector, I mark cards I own.
4. As a collector, I enter what I paid and when.
5. As a collector, I see my portfolio value update from seed prices.

## Screens (web, phone-friendly)
1. Home: set list (OP-09, OP-16)
2. Set detail: rarity tabs + sealed guidance strip
3. Card detail: name, number, rarity, language, seed market price, Own / Add cost basis
4. Collection: owned list
5. Portfolio: total value, cost, unrealized P/L (seed-based)

## Data contract (Cards supplies)
CSV/JSON per set:
- set_code, set_name
- card_id, card_number, name, rarity, language (EN|JP)
- image_url (optional)
- market_usd (seed), as_of
- sealed_guidance (short text: EN box / JP box notes)

Price source V1: static seed from Cards (TCGPlayer / PriceCharting verified). Refresh manually. Live feeds = V1.5+.

## Auth V1
Local-only (browser localStorage). No accounts.

## Repo
`one-piece-collector` (Code mints unless Jib renames).

## Success (2 weeks after V1 up)
Jib opens the app at least 3 separate days and logs ≥10 owned cards with cost basis.

## Kill criteria
If after 2 weeks he has not logged any cards, or says he only needed the Google Sheet book, pause V1.5 and revisit with Side.

## Design bar (Jib, 4 Sep 2026)
Beautiful and super simple. Not another cluttered collector TCG site.
- Thumb-first phone web: big set tiles, clear rarity tabs, few taps to Own / cost / portfolio
- Quiet chrome, strong type, card art when we have it, generous whitespace
- One primary action per screen
- Avoid dense tables, ad-like noise, and toolbars that compete with the cards

## Designer
Design (UI/UX agent) owns V1 visual system and navigation. Design bar above is mandatory. Look researches and picks the best AI model for their own design work, then delivers IA + visual direction + screen specs before Code scaffolds UI. Code waits on Design's V1 design pack for UI; can scaffold data/models from seed CSVs in parallel.

## Phases after V1
- V1.5: charts, watchlist/alerts, condition + language on lots
- V2: scanner + watermark + share, graded, trade helper, pull odds / box EV
- Mobile: App Store after web retention

## Roles
Cards: PM + seed data  
Code: build  
Side: monetization / kill  
Money: runway if paid tools  

## Monetization (Side, greened by Jib 4 Sep 2026)
- Free beta ~20 people via @chatjibpt
- Then S$9–19/mo for portfolio+collection, or S$29 one-time
- First dollar = one paid user

## Kill criteria (Side, supersedes earlier 2-week log metric for go/no-go)
- No payer within 30 days after a working portfolio ships, OR
- Build eats weekday X cadence, OR
- Scanner / graded work starts before there is a payer

V1 success still: Jib uses set browser + logs collection with cost basis. Monetization gate is the Side kill above.

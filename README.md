# Piecebook

Phone-first web app for One Piece TCG collectors. V1 lists every EN booster set on Cards' roster, lets you search every set at once by name or number (a full number opens the card), browse every set's EN checklist by rarity, search a set by name or number, sort by name or seed price, read a short intro per set, see every print of a character across sets, see which sealed product feeds each set, mark the cards you own, log what you paid, and see a seed-priced portfolio.

Specs live alongside the code: `V1-PRD.md` (scope), `V1-DESIGN-PACK.md` (IA, palette, copy), `docs/V1-DESKTOP-LAYOUT.md` (tablet/desktop breakpoints), `docs/V1-SETTILE-AND-GRID-PRICES.md` (sealed box prices on set tiles, muted USD on card cells), `docs/V1-OWN-AND-SET-DEPTH-UI.md` (set intro, thin Own), `docs/V1-SET-DETAIL-CONTROLS.md` (search, sort, All tab), `docs/V1-COST-AND-PORTFOLIO-UI.md` (cost basis, Portfolio), `docs/V1-SETS-ROSTER-UI.md` (full EN roster, pending set detail), `seed-sources.md` (data provenance).

## Run it

```bash
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5173`). Below 768px the app is a phone column with a bottom tab bar; from 768px up it grows to a 720 / 1100 / 1280px column with a quiet top bar and a 3–5 column card grid (see `docs/V1-DESKTOP-LAYOUT.md`).

```bash
npm run build     # type-check + production build into dist/
npm run preview   # serve the production build locally
```

## Routes

| Route | Screen |
| --- | --- |
| `/` | Sets — every EN set on the roster, oldest EN release first. One search field searches every set at once (`?q=`, e.g. `/?q=shanks`): while there is a query the tiles step aside for results grouped by home set in roster order (ten per set, then “All N in OP-09”), names that recur across sets are listed first under “Across sets”, and a full card number shows an “Open” row — Enter on it opens the card |
| `/sets/:setCode` | Set detail — every roster set is seeded: sealed strip (box price), set intro or EN date, search (`?q=`), sort (`?sort=`), rarity tabs with All first (`?rarity=`), card grid (e.g. `/sets/OP-09?sort=price-desc`, `/sets/OP-09?q=roger`). A roster set whose row is flipped back to `pending` shows sealed notes / EN date, then “Checklist not seeded yet”. Unknown code: “Set not found” |
| `/cards/:cardNumber` | Card detail — star to watch; Market (seed) with a price-history line once two or more dated points exist; Mark owned / Remove from collection; once owned, Add cost basis / Edit cost / Clear cost (e.g. `/cards/OP09-001p1`) |
| `/characters/:name` | Character view — every print carrying one card name, grouped by home set in roster order, with the owned check and watch star on each cell (`/characters/Shanks`: 32 prints across 10 sets). Reached from “Across sets” in search |
| `/collection` | Watching (starred sets and cards), then owned cards with a muted `Paid …` line where a cost exists |
| `/portfolio` | Market value, Cost basis, Unrealized P/L from seed prices; Top owned |
| `/about-prices` | How prices work — what “seed” means, where card, history and box prices come from, what Piecebook never does. Linked from the chart footnote and Portfolio |

## Data

- **Catalog** is the read-only seed under `data/`: one `{code}-en-seed.csv` per roster set (23 files, 3,503 rows; see `docs/seed-sources.md`). Every `*-en-seed.csv` is picked up by `import.meta.glob`, bundled into its own `seed` chunk at build time and parsed in the browser. Regular sets load same-set numbered rows only (a row's `card_number` must carry its `set_code`, e.g. `OP17-001` under `OP-17`); PRB premium boosters are reprint products and list every print in the box, so a card has one home set but can also appear in a PRB checklist. See `data/SEED-VERSION.txt`. Adding a set is a CSV drop-in plus flipping its roster row to `ready`.
- **Prices** are the seed `market_usd` values with their `as_of` date. There is no live price feed; every price in the UI is labelled as seed. Card cells show the bare `market_usd` muted under the name; card detail carries the `as_of` date.
- **Parallels** are detected from the card number (`OP09-001p1`) and shown in their own Parallels tab; the All tab includes them too. Each parallel carries a human `variant` name from Limitless ("Alternate Art", "Manga Art", "Special Card", …) shown after the card name; the number stays visible.
- **Card attributes** live in `data/card-attributes/{code}.csv` (category, colour, cost / life, power, counter, attribute, traits, effect and trigger text, illustrator, regulation block, Standard / Extra legality), written by the same refresh and loaded lazily per set. They feed the Play block and artist credit on the roadmap.
- **Set intros** come from `data/set-intros.json`: for every set the EN release date (Bandai EN product page), JP release date and Japanese title (Bandai JP product page), Bandai's EN card-types count, and packs-per-box / cards-per-pack where Bandai states them; the one-line theme is Cards' copy (OP-09, OP-16 so far). Missing fields are simply omitted; nothing is inferred.
- **Search and sort** on Set detail run in the browser over the seed. Search matches name or number (`004`, `op09-004`, `OP09-004`). Sort is Name A to Z (default), Name Z to A, Price high to low, Price low to high; cards without a seed price sort last. Search and sort live in the URL as `?q=` and `?sort=`.
- **Global search** on Sets home (`src/lib/search.ts`) runs the same name-or-number match over every distinct card once (3,301; a PRB reprint of a home-set card is one card, a PRB-only parallel has PRB as its home set). Results are grouped by home set in roster order; a name that recurs in more than one set is listed under “Across sets” with its print and set counts and links to the character view. A query that is a full card number — hyphens, spaces and case forgiven (`OP09-118`, `op09 118`, `op09118`, `op09-004p1`, `P-014`) — resolves to that card: an “Open” row appears and Enter opens it. Under two characters nothing is searched (“Keep typing to search every set.”). Nothing is indexed ahead of time; 3,301 cards filter in under a millisecond per keystroke.
- **Sealed guidance** (the EN / JP box lines on set detail) is derived in `src/data/sealed.ts` from the intro dates and JP title: `Box feeds this set · 13 Dec 2024` / `Box (新たなる皇帝) · 31 Aug 2024`. EB-04 overrides the EN line because it has no EN box.
- **Sealed prices** live on the roster (below): per set, the EN booster box SG ask in SGD with its `sgSource`, the TCGPlayer US market in USD with its `usSource`, the `asOf` date and a `boxArtUrl` for the closed box front shown on the set tile. Box art is vendored under `public/box-art/` and referenced by local path, not hotlinked; the roster value `vendored` resolves to `/box-art/{code}-en-white.jpg`. Set tiles fall back to type-first (big OP code) when there is no art or the image fails to load. Only OP-09 has cleared art so far; adding more needs a closed-box front cleared by Cards / Design, not a scrape.
- **Sets roster** is `data/sets-roster-en.json` (Cards): `{ asOf, note, sets }` with the 23 EN sets (OP-01…OP-17, EB-01…04, PRB-01…02; EB-04 has no EN box and carries null prices), each with `product: booster_box`, EN release date, `cardSeedStatus` (`ready` / `pending`), the EN booster box TCGPlayer US market price with its `asOf` date and `usSource` URL (all 22 sets), an SG ask only where verified (OP-09, OP-16), and optional box art. The roster decides which tiles appear on Sets home and in what order; the card CSVs only decide whether a set has a browsable checklist. `boxArtUrl: "vendored"` means “use the front already under `public/box-art/`”; anything that is not a local path is treated as no art.
- **Price history** is `data/price-history/{code}.csv` (`card_number,as_of,market_usd,source`, one row per card per day). Two sources, both labelled on the chart: `limitless` rows are the daily seed readings from `npm run seed:refresh`; `tcgplayer` rows are a one-off backfill of about a year of weekly market prices from TCGPlayer's product-page chart data (`npm run seed:backfill`, keyed by `data/tcgplayer-products.csv`, approved 5 Sep 2026). Where both exist for a day the Limitless reading wins. History is loaded lazily per set on card detail only and drawn as a quiet line with 1M · 3M · 6M · 1Y · All range chips. There is still no live feed.
- **Refreshing the seed**: `npm run seed:refresh` (Node 18+, no dependencies) re-pulls every roster set from Limitless with the rules in `docs/seed-sources.md`, rewrites the CSVs, appends today's prices to the history and repins `data/SEED-VERSION.txt`. `--sets OP-17,EB-04`, `--dry-run`, `--as-of YYYY-MM-DD`, `--no-history`. It never edits Cards' roster JSON. `npm run seed:check` validates the data contract (headers, same-set rule, rarity codes, CDN-only images, no checklist gaps, pinned counts, one history row per card per day). Parsing all 23 CSVs at startup costs ~4 ms; the seed chunk is ~55 kB gzipped.
- **Automation** (`.github/workflows/`): `ci.yml` type-checks, builds and runs `seed:check` on every push to `main` and every pull request. `seed-refresh.yml` runs the refresh daily at 02:10 UTC (10:10 SGT), builds against the result and opens or updates one PR on the `automation/seed-refresh` branch for review; it can also be run by hand from the Actions tab with a set list or as a dry run. Nothing lands on `main` unreviewed. One-time repo setting: Settings → Actions → General → Workflow permissions → allow GitHub Actions to create pull requests.
- **Where the history comes from**: Piecebook's own daily readings began on 4 Sep 2026. There is no free historical feed (Collectr and PriceCharting hold years because they have snapshotted licensed TCGPlayer / eBay sales data daily for years; PriceCharting's API explicitly excludes history), so on 5 Sep 2026 Jib approved a single backfill from TCGPlayer's product-page chart endpoint, which gives roughly a year of weekly market prices per print. The daily workflow carries it forward from there. Details and the trade-offs in `docs/V1-WATCHLIST-AND-CHARTS.md`.
- **Portfolio math** runs in the browser over your owned cards: market value is Σ seed `market_usd × qty` (USD); cost basis is summed per currency (SGD, USD) and never converted; unrealized P/L is only computed for cards with a USD cost, against the USD seed market. Nothing is live.

## Your data is local-only

Owned flags, quantities and cost basis are stored in your browser's `localStorage` under the key `piecebook.v1`, one entry per owned card: `{ qty, ownedAt, cost?: { amount, currency: 'SGD' | 'USD', paidOn, note? } }`. A cost can only exist on an owned card; removing the card from your collection clears it. The watchlist (starred cards and sets) is stored separately under `piecebook.watchlist.v1`. There are no accounts and nothing is sent anywhere. Clearing site data for the app wipes both.

## Deploying

The build in `dist/` is a static single-page app. Configure your host to serve `index.html` for unknown paths so deep links like `/cards/OP16-001` work (a `public/_redirects` file is included for Netlify-style hosts).

## Not in V1

Live prices, alerts, FX conversion, player search facets (colour, category, cost, trait, effect — growth map 2.3, with Phase 6), scanning, accounts or sync, marketplace or affiliate links, dark mode.

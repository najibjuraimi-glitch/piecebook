# Piecebook

Phone-first web app for One Piece TCG collectors. V1 lists every EN booster set on Cards' roster, lets you browse OP-09 and OP-16 by rarity, search a set by name or number, sort by name or seed price, read a short intro per set, see which sealed product feeds each set, mark the cards you own, log what you paid, and see a seed-priced portfolio.

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
| `/` | Sets — every EN set on the roster, oldest EN release first |
| `/sets/:setCode` | Set detail — seeded sets (OP-09, OP-16): sealed strip, set intro, search, sort (`?sort=`), rarity tabs with All first (`?rarity=`), card grid (e.g. `/sets/OP-09?sort=price-desc`). Roster sets without a checklist yet (e.g. `/sets/OP-01`): sealed notes / EN date if known, then “Checklist not seeded yet”. Unknown code: “Set not found” |
| `/cards/:cardNumber` | Card detail — Mark owned / Remove from collection; once owned, Add cost basis / Edit cost / Clear cost (e.g. `/cards/OP09-001p1`) |
| `/collection` | Owned cards, with a muted `Paid …` line where a cost exists |
| `/portfolio` | Market value, Cost basis, Unrealized P/L from seed prices; Top owned |

## Data

- **Catalog** is the read-only seed under `data/` (`op09-en-seed.csv`, `op16-en-seed.csv`). The CSVs are bundled into the app at build time and parsed in the browser. Only same-set numbered rows (`OP09-*`, `OP16-*`) are loaded, per `data/SEED-VERSION.txt`.
- **Prices** are the seed `market_usd` values with their `as_of` date. There is no live price feed; every price in the UI is labelled as seed. Card cells show the bare `market_usd` muted under the name; card detail carries the `as_of` date.
- **Parallels** are detected from the card number (`OP09-001p1`) and shown in their own Parallels tab; the All tab includes them too.
- **Set intros** come from `data/set-intros.json` (Cards): a one-line theme, EN/JP release dates and packs-per-box / cards-per-pack. Missing fields are simply omitted; nothing is inferred.
- **Search and sort** on Set detail run in the browser over the seed. Search matches name or number (`004`, `op09-004`, `OP09-004`). Sort is Name A to Z (default), Name Z to A, Price high to low, Price low to high; cards without a seed price sort last. Sort lives in the URL as `?sort=`.
- **Sealed guidance** is not yet a CSV column, so the short EN/JP notes per set live in `src/data/sealed.ts`.
- **Sealed prices** come from `data/sealed-seed.json` (Cards): per set, the EN booster box SG ask in SGD, the TCGPlayer US market in USD, the `asOf` date and a `boxArtUrl` for the closed box front shown on the set tile. Box art is vendored under `public/box-art/` and referenced by local path, not hotlinked. Set tiles fall back to type-first (big OP code) when the URL is missing or the image fails to load.
- **Sets roster** is `data/sets-roster-en.json` (Cards): `{ asOf, note, sets }` with the 22 EN booster sets (OP-01…OP-17, EB-01…03, PRB-01…02), each with `product: booster_box`, EN release date, `cardSeedStatus` (`ready` / `pending`), the EN booster box TCGPlayer US market price with its `asOf` date and `usSource` URL (all 22 sets), an SG ask only where verified (OP-09, OP-16), and optional box art. The roster decides which tiles appear on Sets home and in what order; the card CSVs only decide whether a set has a browsable checklist. `boxArtUrl: "vendored"` means “use the front already under `public/box-art/`”; anything that is not a local path is treated as no art.
- **Portfolio math** runs in the browser over your owned cards: market value is Σ seed `market_usd × qty` (USD); cost basis is summed per currency (SGD, USD) and never converted; unrealized P/L is only computed for cards with a USD cost, against the USD seed market. Nothing is live.

## Your data is local-only

Owned flags, quantities and cost basis are stored in your browser's `localStorage` under the key `piecebook.v1`, one entry per owned card: `{ qty, ownedAt, cost?: { amount, currency: 'SGD' | 'USD', paidOn, note? } }`. A cost can only exist on an owned card; removing the card from your collection clears it. There are no accounts and nothing is sent anywhere. Clearing site data for the app wipes your collection.

## Deploying

The build in `dist/` is a static single-page app. Configure your host to serve `index.html` for unknown paths so deep links like `/cards/OP16-001` work (a `public/_redirects` file is included for Netlify-style hosts).

## Not in V1

Live prices, charts, alerts, FX conversion, global search across sets, scanning, accounts or sync, marketplace or affiliate links, dark mode.

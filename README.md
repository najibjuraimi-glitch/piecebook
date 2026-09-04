# Piecebook

Phone-first web app for One Piece TCG collectors. V1 lets you browse OP-09 and OP-16 by rarity, search a set by name or number, sort by name or seed price, read a short intro per set, see which sealed product feeds each set, and mark the cards you own.

Specs live alongside the code: `V1-PRD.md` (scope), `V1-DESIGN-PACK.md` (IA, palette, copy), `docs/V1-DESKTOP-LAYOUT.md` (tablet/desktop breakpoints), `docs/V1-SETTILE-AND-GRID-PRICES.md` (sealed box prices on set tiles, muted USD on card cells), `seed-sources.md` (data provenance).

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
| `/` | Sets |
| `/sets/:setCode` | Set detail — sealed strip, set intro, search, sort (`?sort=`), rarity tabs with All first (`?rarity=`), card grid (e.g. `/sets/OP-09?sort=price-desc`) |
| `/cards/:cardNumber` | Card detail — Mark owned / Remove from collection (e.g. `/cards/OP09-001p1`) |
| `/collection` | Owned cards |
| `/portfolio` | Stub: seed market value summary |

## Data

- **Catalog** is the read-only seed under `data/` (`op09-en-seed.csv`, `op16-en-seed.csv`). The CSVs are bundled into the app at build time and parsed in the browser. Only same-set numbered rows (`OP09-*`, `OP16-*`) are loaded, per `data/SEED-VERSION.txt`.
- **Prices** are the seed `market_usd` values with their `as_of` date. There is no live price feed; every price in the UI is labelled as seed. Card cells show the bare `market_usd` muted under the name; card detail carries the `as_of` date.
- **Parallels** are detected from the card number (`OP09-001p1`) and shown in their own Parallels tab; the All tab includes them too.
- **Set intros** come from `data/set-intros.json` (Cards): a one-line theme, EN/JP release dates and packs-per-box / cards-per-pack. Missing fields are simply omitted; nothing is inferred.
- **Search and sort** on Set detail run in the browser over the seed. Search matches name or number (`004`, `op09-004`, `OP09-004`). Sort is Name A to Z (default), Name Z to A, Price high to low, Price low to high; cards without a seed price sort last. Sort lives in the URL as `?sort=`.
- **Sealed guidance** is not yet a CSV column, so the short EN/JP notes per set live in `src/data/sealed.ts`.
- **Sealed prices** come from `data/sealed-seed.json` (Cards): per set, the EN booster box SG ask in SGD, the TCGPlayer US market in USD, the `asOf` date and a `boxArtUrl` for the closed box front shown on the set tile. Box art is vendored under `public/box-art/` and referenced by local path, not hotlinked. Set tiles fall back to type-first (big OP code) when the URL is missing or the image fails to load.

## Your data is local-only

Owned flags and quantities are stored in your browser's `localStorage` under the key `piecebook.v1`. There is no cost, date or note entry in V1. There are no accounts and nothing is sent anywhere. Clearing site data for the app wipes your collection.

## Deploying

The build in `dist/` is a static single-page app. Configure your host to serve `index.html` for unknown paths so deep links like `/cards/OP16-001` work (a `public/_redirects` file is included for Netlify-style hosts).

## Not in V1

Live prices, charts, alerts, cost basis and portfolio math, global search across sets, scanning, accounts or sync, marketplace or affiliate links, dark mode.

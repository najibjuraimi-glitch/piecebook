# One Piece TCG EN seed sources (all 22 roster sets)

OP-09 and OP-16 generated 2026-09-04 (Asia/Singapore), `as_of` `2026-09-04`. The other 20 sets generated 2026-09-05 with the same method against the same source, `as_of` `2026-09-05`. OP-09 / OP-16 rows were left exactly as first seeded (the 2026-09-05 re-scrape reproduced their 151 / 149 card numbers, names, rarities and images identically; only live prices had moved).

## Output files

| File | Set code | Exact EN set name | Rows | Base | Parallels | Rows with `market_usd` | `as_of` |
|------|----------|-------------------|------|------|-----------|------------------------|---------|
| `op01-en-seed.csv` | OP-01 | Romance Dawn | 154 | 121 | 33 | 154 | 2026-09-05 |
| `op02-en-seed.csv` | OP-02 | Paramount War | 154 | 121 | 33 | 154 | 2026-09-05 |
| `op03-en-seed.csv` | OP-03 | Pillars of Strength | 150 | 123 | 27 | 150 | 2026-09-05 |
| `op04-en-seed.csv` | OP-04 | Kingdoms of Intrigue | 144 | 119 | 25 | 144 | 2026-09-05 |
| `op05-en-seed.csv` | OP-05 | Awakening of the New Era | 147 | 119 | 28 | 147 | 2026-09-05 |
| `op06-en-seed.csv` | OP-06 | Wings of the Captain | 144 | 119 | 25 | 144 | 2026-09-05 |
| `eb01-en-seed.csv` | EB-01 | Memorial Collection | 80 | 61 | 19 | 80 | 2026-09-05 |
| `op07-en-seed.csv` | OP-07 | 500 Years in the Future | 144 | 119 | 25 | 144 | 2026-09-05 |
| `op08-en-seed.csv` | OP-08 | Two Legends | 144 | 119 | 25 | 144 | 2026-09-05 |
| `prb01-en-seed.csv` | PRB-01 | One Piece Card The Best | 2 | 1 | 1 | 2 | 2026-09-05 |
| `op09-en-seed.csv` | OP-09 | Emperors in the New World | 151 | 119 | 32 | 151 | 2026-09-04 |
| `op10-en-seed.csv` | OP-10 | Royal Blood | 144 | 119 | 25 | 144 | 2026-09-05 |
| `eb02-en-seed.csv` | EB-02 | Anime 25th Collection | 79 | 61 | 18 | 79 | 2026-09-05 |
| `op11-en-seed.csv` | OP-11 | A Fist of Divine Speed | 147 | 119 | 28 | 147 | 2026-09-05 |
| `op12-en-seed.csv` | OP-12 | Legacy of the Master | 146 | 119 | 27 | 146 | 2026-09-05 |
| `prb02-en-seed.csv` | PRB-02 | One Piece Card The Best Vol.2 | 36 | 18 | 18 | 36 | 2026-09-05 |
| `op13-en-seed.csv` | OP-13 | Carrying on His Will | 165 | 120 | 45 | 165 | 2026-09-05 |
| `op14-en-seed.csv` | OP-14 | The Azure Sea's Seven | 149 | 120 | 29 | 149 | 2026-09-05 |
| `eb03-en-seed.csv` | EB-03 | One Piece Heroines Edition | 90 | 62 | 28 | 90 | 2026-09-05 |
| `op15-en-seed.csv` | OP-15 | Adventure on Kami's Island | 146 | 119 | 27 | 146 | 2026-09-05 |
| `op16-en-seed.csv` | OP-16 | The Time of Battle | 149 | 119 | 30 | 149 | 2026-09-04 |
| `op17-en-seed.csv` | OP-17 | The World's Strongest Warriors | 158 | 119 | 39 | 157 | 2026-09-05 |

2,823 rows in total. Row counts per file are also pinned in `data/SEED-VERSION.txt`.

CSV header (exact): `set_code,set_name,card_number,name,rarity,language,image_url,market_usd,as_of`

- `language` = `EN` on every row. `set_name` is Cards' roster name (`data/sets-roster-en.json`), which matches the Limitless set label on every set except PRB-01 (Limitless: “One Piece The Best”; roster / official Bandai: “One Piece Card The Best”).
- Base checklist complete for every set: no gaps from 001 to the highest number Limitless lists (121 for OP-01 / OP-02, 123 for OP-03, 120 for OP-13 / OP-14, 61 / 61 / 62 for EB-01 / 02 / 03, 18 for PRB-02, 119 otherwise).
- Leaders and parallels included when Limitless lists them as separate prints.
- Parallel `card_number` uses Limitless CDN suffix style: `OP09-001p1` from `OP09-001_p1_EN.webp` (p1 / p2 / p3 …).
- Rarity uses official codes (`L`, `C`, `UC`, `R`, `SR`, `SEC`, `SP`, `TR`). Limitless style labels (“Alternate Art”, “Manga Art”, and the untranslated `card.style.panda` key on some OP-17 prints) inherit the base print's official rarity; a parallel Limitless labels “Special Card” / “Treasure Rare” keeps `SP` / `TR`.
- **Same-set rows only** (`data/SEED-VERSION.txt`: `cleaned-same-set-only`). Every CSV keeps only card numbers that carry its own set code. Cross-set Special / Treasure Rare pulls and reprint parallels that Limitless files on a set page are dropped at build time and again by the app loader (`src/data/seed.ts`). See Gaps for what that excludes.
- No invented cards or prices. Blank `market_usd` / `as_of` means Limitless showed no USD for that print; exactly one row is blank (`OP17-118p2`).

**Name clarification:** OP-16 English name is **The Time of Battle** (official Bandai). “Heroes of the Grand Line” is **not** the official EN set name.

## Primary sources (URLs used)

All 22 sets: `https://onepiece.limitlesstcg.com/cards/en/{slug}?display=full&show=all&per-page=all`, slugs from the Limitless EN set index (`/cards/en`): `op01-romance-dawn`, `op02-paramount-war`, `op03-pillars-of-strength`, `op04-kingdoms-of-intrigue`, `op05-awakening-of-the-new-era`, `op06-wings-of-the-captain`, `eb01-memorial-collection`, `op07-500-years-in-the-future`, `op08-two-legends`, `prb01-premium-booster-one-piece-the-best`, `op09-emperors-in-the-new-world`, `op10-royal-blood`, `eb02-anime-25th-collection`, `op11-a-fist-of-divine-speed`, `op12-legacy-of-the-master`, `prb02-one-piece-card-the-best-vol2`, `op13-carrying-on-his-will`, `op14-the-azure-seas-seven`, `eb03-one-piece-heroines-edition`, `op15-adventure-on-kamis-island`, `op16-the-time-of-battle`, `op17-the-worlds-strongest-warriors`. Fields pulled per `card-page-main` block are the same as for OP-09 / OP-16 below.

### Limitless One Piece — card identity, rarity labels, images, USD (TCGPlayer partner)

1. https://onepiece.limitlesstcg.com/cards/en/op09-emperors-in-the-new-world  
   Fetched with `?display=full&show=all&per-page=all` (159 card profiles).  
   Pulled: card number, name, rarity/print label, Limitless CDN `image_url`, USD from the **current** print row in the prints table (TCGPlayer market via Limitless partner links).

2. https://onepiece.limitlesstcg.com/cards/en/op16-the-time-of-battle  
   Same fetch pattern (155 card profiles). Same fields as above.

3. Example card detail pages (print/price structure confirmation):  
   - https://onepiece.limitlesstcg.com/cards/en/OP09-001  
   - https://onepiece.limitlesstcg.com/cards/en/OP16-001  
   - https://onepiece.limitlesstcg.com/cards/en/OP16-003  

4. Image CDN:  
   `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/{SET}/{CARD}_EN.webp`  
   Parallels: `{CARD}_p{N}_EN.webp`

### Official Bandai EN — set name / product confirmation

5. https://en.onepiece-cardgame.com/products/op16.html  
   Confirmed EN name **THE TIME OF BATTLE [OP-16]**, release 2026-06-12, contents “126+1 types” (Commons…Specials, Treasure Rare, DON!! Card).

### Cross-check APIs / lists (identity & coverage; USD taken from Limitless current-print rows)

6. https://optcgapi.com/api/sets/OP-09/ — 159 entries; set_name Emperors in the New World; market_price / card_image cross-check (scraped ~2026-09-02).  
7. https://optcgapi.com/api/sets/OP-16/ — 155 entries; set_name The Time of Battle; market_price cross-check (scraped ~2026-09-03).  
8. https://optcgapi.com/api/allSets/ — confirmed set_id / set_name pairs for OP-09 and OP-16.  
9. https://onepiececardlist.com/sets/op09-emperors-in-the-new-world — OP-09 119-card overview (identity only).  
10. https://samuraiswordtokyo.com/blogs/news/op-09-card-list-all-cards — OP-09 base 119 + parallel catalogue summary.  
11. https://samuraiswordtokyo.com/blogs/news/op-16-card-list-all-cards — OP-16 base 119 + parallel catalogue summary.  
12. https://playeronecollectibles.com/allcards-setlist.php?path=one-piece%2Fop-english%2Femperors-in-the-new-world-op-09-english-369 — OP-09 EN set list cross-check.

## Gaps (see also `README-gaps.md`)

- **OP-16 DON!! card(s):** Official Bandai lists “126+1 types” including a DON!! Card. Limitless OP-16 set page and OPTCG `/sets/OP-16/` do **not** include a DON!! row in the set checklist scrape used here, so **no DON!! row was invented**. TCGPlayer has separate DON!! products under The Time of Battle (e.g. product 698314 Alternate Art Gold) but without a verified checklist `card_number` / Limitless set-page image they were omitted.
- **OP-09 DON!!:** Same omission pattern if present as a pack insert; not on the Limitless OP-09 EN set page scrape (159 profiles = 119 base + same-set parallels + 8 cross-set SP/TR pulls).
- **DON!! cards, all sets:** Limitless set pages carry no DON!! rows, so none were seeded for any set.
- No missing base numbers for any set.
- **Premium boosters are thin under the same-set rule.** PRB-01 and PRB-02 are reprint sets: their Limitless pages list 319 and 316 prints, but only PRB01-001 (+ p1) and PRB02-001…018 (+ p1 each) carry a PRB number. The 317 / 280 cross-set reprint parallels (OP01–OP10, EB-01/02, ST, P promos) are excluded, so the seeds hold 2 and 36 rows. Including them would need a deliberate change to the same-set rule.
- **EB-04 (no standalone EN box) is not seeded.** Its 81 EN cards are filed on the OP-14 (40 prints) and OP-15 (41) Limitless pages because the EB-04 product ships as OP14-EB04 / OP15-EB04 bundles. EB-04 is not on Cards' roster, so those rows are excluded; they would need an EB-04 roster row and CSV of their own.
- **Other cross-set exclusions** (SP / TR chase pulls and promos filed on a set page): OP-03 4, OP-04 5, OP-05 7, OP-06 7, OP-07 7, OP-08 7, OP-10 7, EB-02 26, OP-11 9, OP-12 9, OP-13 10, OP-14 10 non-EB-04, OP-15 9 non-EB-04, OP-17 11. OP-01, OP-02, EB-01, EB-03 had none.
- **One unpriced print:** `OP17-118p2` had no USD on Limitless at scrape time; `market_usd` / `as_of` left blank (the app shows “No seed price”).

## Method

1. Verified EN set names (Bandai + Limitless + OPTCG allSets).  
2. Fetched Limitless EN full set pages; parsed each `card-page-main` block.  
3. Took USD from `tr.current` in the prints table (correct parallel price, not the base row).  
4. Mapped rarity codes; AA/Manga → base rarity; Special Card → `SP`; Treasure Rare → `TR`.  
5. Wrote CSVs under `/workspace/op-collector/` plus this sources log and `README-gaps.md`.
6. (2026-09-05, remaining 20 sets) Re-ran steps 2–4 with one parser for every set, validating it first by regenerating OP-09 / OP-16 and diffing against the committed CSVs (identical card numbers, names, rarities and image URLs). Kept same-set rows only, wrote `data/{code}-en-seed.csv`, flipped each roster row to `cardSeedStatus: ready`.

## EN sets roster (`data/sets-roster-en.json`)

One object `{ asOf, note, sets }`, file-level `asOf` 2026-09-04. 22 EN booster sets in `sets`: OP-01…OP-17, EB-01…EB-03, PRB-01…PRB-02, every row `product: booster_box`. OP-13 is spelled `Carrying on His Will` (lowercase on), per Cards.

- `cardSeedStatus` is `ready` on all 22 rows as of 2026-09-05 (one CSV per set, table above). `boxArtUrl` is still `null` everywhere except OP-09; no art was added.
- **Sealed box prices (Cards' 4 Sep 2026 hunt).** Every one of the 22 rows carries `usMarketUsd` (TCGPlayer market / identifiable Unopened English booster box ask, read 4 Sep 2026) with a per-row `asOf` of `2026-09-04` and the TCGPlayer product URL in `usSource` (e.g. OP-01 → product 557280, OP-17 → product 704752). `sgAskSgd` is set only where an SG ask was verified: OP-09 S$750 and OP-16 S$295; every other row keeps `sgAskSgd: null` and the UI never derives an SGD figure from USD. EB-02 carries a `priceNote` explaining which listing was used. Source URLs are provenance only; the app does not render them as links.
- OP-09 / OP-16 prices repeat `data/sealed-seed.json` (SG ask S$750 / S$295, TCGPlayer US market $669.52 / $207.42). OP-09 `boxArtUrl` is `vendored` → `/box-art/op09-en-white.jpg`; OP-16 stays `null`.
- EN set names and EN release dates (`enReleased`) were cross-checked across four independent release calendars that agree on every row:
  - https://samuraiswordtokyo.com/blogs/news/one-piece-card-sets-in-order
  - https://www.trackalacker.com/articles/news/one-piece-card-game-full-product-list
  - https://tcgking.nl/blogs/collecting/one-piece-card-game-release-schedule-2026-set-list
  - https://www.misprint.com/posts/one-piece-tcg-release-calendar
  - Official product pages (https://en.onepiece-cardgame.com/products/op17.html etc.) confirm names; their dates render client-side and were not scraped.
- Not included: EB-04 (no standalone EN box; folded into OP14-EB04 / OP15-EB04), EB-05 and OP-18 (not released as of `asOf`), starter decks, promos.

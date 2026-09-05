# One Piece TCG EN seed sources (OP-09, OP-16)

Generated: 2026-09-04 (Asia/Singapore). `as_of` on priced rows is `2026-09-04`.

## Output files

| File | Set code | Exact EN set name | Rows | Rows with `market_usd` |
|------|----------|-------------------|------|------------------------|
| `op09-en-seed.csv` | OP-09 | Emperors in the New World | 159 | 159 |
| `op16-en-seed.csv` | OP-16 | The Time of Battle | 155 | 155 |

CSV header (exact): `set_code,set_name,card_number,name,rarity,language,image_url,market_usd,as_of`

- `language` = `EN` on every row.
- Base checklist complete for both sets: OP09-001…OP09-119 and OP16-001…OP16-119 (119 each).
- Leaders and parallels included when Limitless lists them as separate prints.
- Parallel `card_number` uses Limitless CDN suffix style: `OP09-001p1` from `OP09-001_p1_EN.webp` (p1 / p2 / p3).
- Rarity uses official codes (`L`, `C`, `UC`, `R`, `SR`, `SEC`, `SP`, `TR`). Limitless labels “Alternate Art” / “Manga Art” inherit the base print’s official rarity.
- Cross-set Special / Treasure Rare pulls that Limitless files on these set pages are **included** (distinct numbers/rarities on the source).
- No invented cards or prices. Blank `market_usd` / `as_of` would mean unverified; none blank in this scrape.

**Name clarification:** OP-16 English name is **The Time of Battle** (official Bandai). “Heroes of the Grand Line” is **not** the official EN set name.

## Primary sources (URLs used)

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
- No missing base numbers 001–119 for either set.

## Method

1. Verified EN set names (Bandai + Limitless + OPTCG allSets).  
2. Fetched Limitless EN full set pages; parsed each `card-page-main` block.  
3. Took USD from `tr.current` in the prints table (correct parallel price, not the base row).  
4. Mapped rarity codes; AA/Manga → base rarity; Special Card → `SP`; Treasure Rare → `TR`.  
5. Wrote CSVs under `/workspace/op-collector/` plus this sources log and `README-gaps.md`.

## EN sets roster (`data/sets-roster-en.json`)

One object `{ asOf, note, sets }`, file-level `asOf` 2026-09-04. 22 EN booster sets in `sets`: OP-01…OP-17, EB-01…EB-03, PRB-01…PRB-02, every row `product: booster_box`. OP-13 is spelled `Carrying on His Will` (lowercase on), per Cards.

- `cardSeedStatus` is `ready` only for OP-09 and OP-16 (the two CSVs above); every other row is `pending` with `boxArtUrl` `null`. No card checklists or art were added for pending sets.
- **Sealed box prices (Cards' 4 Sep 2026 hunt).** Every one of the 22 rows carries `usMarketUsd` (TCGPlayer market / identifiable Unopened English booster box ask, read 4 Sep 2026) with a per-row `asOf` of `2026-09-04` and the TCGPlayer product URL in `usSource` (e.g. OP-01 → product 557280, OP-17 → product 704752). `sgAskSgd` is set only where an SG ask was verified: OP-09 S$750 and OP-16 S$295; every other row keeps `sgAskSgd: null` and the UI never derives an SGD figure from USD. EB-02 carries a `priceNote` explaining which listing was used. Source URLs are provenance only; the app does not render them as links.
- OP-09 / OP-16 prices repeat `data/sealed-seed.json` (SG ask S$750 / S$295, TCGPlayer US market $669.52 / $207.42). OP-09 `boxArtUrl` is `vendored` → `/box-art/op09-en-white.jpg`; OP-16 stays `null`.
- EN set names and EN release dates (`enReleased`) were cross-checked across four independent release calendars that agree on every row:
  - https://samuraiswordtokyo.com/blogs/news/one-piece-card-sets-in-order
  - https://www.trackalacker.com/articles/news/one-piece-card-game-full-product-list
  - https://tcgking.nl/blogs/collecting/one-piece-card-game-release-schedule-2026-set-list
  - https://www.misprint.com/posts/one-piece-tcg-release-calendar
  - Official product pages (https://en.onepiece-cardgame.com/products/op17.html etc.) confirm names; their dates render client-side and were not scraped.
- Not included: EB-04 (no standalone EN box; folded into OP14-EB04 / OP15-EB04), EB-05 and OP-18 (not released as of `asOf`), starter decks, promos.

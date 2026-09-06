# One Piece TCG EN seed sources (all 23 roster sets)

OP-09 and OP-16 first generated 2026-09-04 (Asia/Singapore); the other sets 2026-09-05 with the same method against the same source. On 2026-09-05 `npm run seed:refresh` (see Method 8) re-pulled every set: 20 of 23 CSVs came back byte-identical, OP-09 / OP-16 moved to `as_of` `2026-09-05` prices (their 2026-09-04 prices are kept in `data/price-history/`), and EB-04 gained `EB04-054p1`.

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
| `prb01-en-seed.csv` | PRB-01 | One Piece Card The Best | 319 | 1 own + 103 reprint bases | 1 own + 214 reprint parallels | 318 | 2026-09-05 |
| `op09-en-seed.csv` | OP-09 | Emperors in the New World | 151 | 119 | 32 | 151 | 2026-09-05 |
| `op10-en-seed.csv` | OP-10 | Royal Blood | 144 | 119 | 25 | 144 | 2026-09-05 |
| `eb02-en-seed.csv` | EB-02 | Anime 25th Collection | 79 | 61 | 18 | 79 | 2026-09-05 |
| `op11-en-seed.csv` | OP-11 | A Fist of Divine Speed | 147 | 119 | 28 | 147 | 2026-09-05 |
| `op12-en-seed.csv` | OP-12 | Legacy of the Master | 146 | 119 | 27 | 146 | 2026-09-05 |
| `prb02-en-seed.csv` | PRB-02 | One Piece Card The Best Vol.2 | 316 | 18 own + 140 reprint bases | 18 own + 140 reprint parallels | 316 | 2026-09-05 |
| `op13-en-seed.csv` | OP-13 | Carrying on His Will | 165 | 120 | 45 | 165 | 2026-09-05 |
| `eb04-en-seed.csv` | EB-04 | Egghead Crisis | 84 | 61 | 23 | 83 | 2026-09-05 |
| `op14-en-seed.csv` | OP-14 | The Azure Sea's Seven | 149 | 120 | 29 | 149 | 2026-09-05 |
| `eb03-en-seed.csv` | EB-03 | One Piece Heroines Edition | 90 | 62 | 28 | 90 | 2026-09-05 |
| `op15-en-seed.csv` | OP-15 | Adventure on Kami's Island | 146 | 119 | 27 | 146 | 2026-09-05 |
| `op16-en-seed.csv` | OP-16 | The Time of Battle | 149 | 119 | 30 | 149 | 2026-09-05 |
| `op17-en-seed.csv` | OP-17 | The World's Strongest Warriors | 158 | 119 | 39 | 157 | 2026-09-05 |

3,504 rows in total. Row counts per file are also pinned in `data/SEED-VERSION.txt`.

CSV header (exact): `set_code,set_name,card_number,name,rarity,language,image_url,market_usd,as_of,variant`

- `variant` (added 5 Sep 2026): the human name of a parallel print as Limitless labels it ("Alternate Art", "Manga Art", "Special Card", "Treasure Rare", "Pirate Foil", "Full Art", "Textured Foil"); Limitless's untranslated `card.style.*` keys and blank labels become the plain word "Parallel" rather than a guessed style. Blank on every base print. The rarity rule is unchanged: style labels inherit the base print's rarity, Special Card / Treasure Rare keep `SP` / `TR`.

**Card attributes** (added 5 Sep 2026): `data/card-attributes/{code}.csv`, one row per seed row in the same order, header `card_number,variant,category,color,cost,life,power,counter,attribute,types,effect,trigger,artist,block,standard,extra`. Category (Leader / Character / Event / Stage), colour ("Red" or "Red/Green"), cost or life, power, counter, attribute, traits as printed (slash-separated), effect text and any `[Trigger]` text as printed (links and reminder text flattened to plain text), illustrator where Limitless credits one, regulation block number, Standard / Extra legality as Limitless publishes it. All read from the same `card-page-main` block as the price. Piecebook adds no words of its own; card text is Bandai's, shown as every card database shows it (accepted by Jib, 5 Sep 2026). Loaded lazily per set by `src/data/attributes.ts`.

- `language` = `EN` on every row. `set_name` is Cards' roster name (`data/sets-roster-en.json`), which matches the Limitless set label on every set except PRB-01 (Limitless: “One Piece The Best”; roster / official Bandai: “One Piece Card The Best”).
- Base checklist complete for every set: no gaps from 001 to the highest number Limitless lists (121 for OP-01 / OP-02, 123 for OP-03, 120 for OP-13 / OP-14, 61 / 61 / 62 for EB-01 / 02 / 03, 18 for PRB-02, 119 otherwise).
- Leaders and parallels included when Limitless lists them as separate prints.
- Parallel `card_number` uses Limitless CDN suffix style: `OP09-001p1` from `OP09-001_p1_EN.webp` (p1 / p2 / p3 …).
- Rarity uses official codes (`L`, `C`, `UC`, `R`, `SR`, `SEC`, `SP`, `TR`). Limitless style labels (“Alternate Art”, “Manga Art”, and the untranslated `card.style.panda` key on some OP-17 prints) inherit the base print's official rarity; a parallel Limitless labels “Special Card” / “Treasure Rare” keeps `SP` / `TR`.
- **Same-set rows only for regular sets** (`data/SEED-VERSION.txt`: `cleaned-same-set-only`). Each OP / EB CSV keeps only card numbers that carry its own set code; cross-set Special / Treasure Rare pulls Limitless files on a set page are dropped at build time and again by the app loader (`src/data/seed.ts`). See Gaps for what that excludes.
- **PRB reprint sets list every print in the box.** `prb01` / `prb02` carry all prints on their Limitless pages, cross-set numbers included (OP01–OP10, EB-01/02, ST decks, P promos), because a premium booster is a reprint product. In the app a card keeps one home set (the first CSV listing its number, e.g. `OP01-024` → OP-01) and is additionally a member of the PRB checklist; PRB-only parallels such as `OP01-120p2` have PRB as their home set. Rarity for reprints: the official label when Limitless shows one, else the base print's rarity from the same page or from the base set's CSV; promo-numbered `P-` cards take the official `P` (Promo) code since Limitless shows only the promo set name for them.
- **EB-04 has no Limitless EN set page and no EN box.** Its EN prints (EB04-001…061 plus parallels) are filed on the OP-14 (40 prints), OP-15 (41) and OP-17 (2) pages because the product shipped as OP14-EB04 / OP15-EB04; `eb04-en-seed.csv` collects exactly those EB04-numbered rows.
- No invented cards or prices. Blank `market_usd` / `as_of` means Limitless showed no USD for that print; three rows are blank (`OP17-118p2`, `OP05-115p1` in `prb01`, `EB04-061p3`).

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
- **Premium boosters (resolved 2026-09-05).** PRB-01 / PRB-02 first seeded 2 / 36 rows under the same-set rule; now list all 319 / 316 prints on their Limitless pages (see the PRB bullet above). 84 / 110 of those are plain base reprints of cards already seeded in their home sets and appear in both checklists.
- **EB-04 (resolved 2026-09-05).** Added as a roster row (`Egghead Crisis`, `enReleased` 2026-01-16 = first EN availability via OP14-EB04; EB04-001…010 followed in OP15-EB04 on 2026-04-03) with `sgAskSgd` / `usMarketUsd` null and a `priceNote`, since no standalone EN box exists. Sources: https://en.onepiece-cardgame.com/products/boosters/op14-eb04.php (AVAILABLE JAN. 16, 2026), https://en.onepiece-cardgame.com/products/boosters/op15-eb04.php (AVAILABLE APR. 3, 2026); JP set name Egghead Crisis per https://playvault.ae/pages/one-piece-card-game-set-list and https://www.cardgamecollector.com/news/one-piece-azure-seas-seven-op14-eb04-double-pack.html. Bandai has no `products/eb04.html` page (404).
- **Other cross-set exclusions** (SP / TR chase pulls and promos filed on a set page): OP-03 4, OP-04 5, OP-05 7, OP-06 7, OP-07 7, OP-08 7, OP-10 7, EB-02 26, OP-11 9, OP-12 9, OP-13 10, OP-14 10 non-EB-04, OP-15 9 non-EB-04, OP-17 11. OP-01, OP-02, EB-01, EB-03 had none.
- **Unpriced prints:** `OP17-118p2`, `OP05-115p1` (PRB-01 reprint parallel) and `EB04-061p3` had no USD on Limitless at scrape time; `market_usd` / `as_of` left blank (the app shows “No seed price”).

## Set intros (`data/set-intros.json`)

One row per roster set. `enReleased` from Bandai's EN product page (`https://en.onepiece-cardgame.com/products/boosters/{code}.php`; OP-14 / OP-15 use `op14-eb04.php` / `op15-eb04.php`, OP-16 `products/op16.html`; the OP-17 EN page was an empty stub so its date is the roster's, cross-checked on the Limitless index). `jpReleased` and `jpName` from Bandai's JP product page (`https://www.onepiece-cardgame.com/products/boosters/{code}.php` or `/{code}/`), fields 発売日 and 商品名 with the product-type prefix and 【code】 suffix stripped. `cardTypes` is Bandai's EN "card types" figure as printed (`126+1`); for OP-14 / OP-15 it counts the combined OP14-EB04 / OP15-EB04 product. `packsPerBox` / `cardsPerPack` only where Bandai states them (EB-01: 12 cards, 24 packs; OP-09 / OP-16 from the retail box print). Every EN date matched the roster's `enReleased`; OP-09 / OP-16 JP dates matched the previously hand-written guidance.

**Set stories (7.1, 6 Sep 2026).** `introTheme` is the one sentence of authored copy per booster set, and `introSource` is the Bandai EN product page it was written from (never quoted): `products/boosters/{code}.php` for OP-01 … OP-13, EB-01 … EB-03 and PRB-01 / PRB-02, `op14-eb04.php` / `op15-eb04.php`, `products/op16.html`, `products/eb05.html`. Bandai has no EN product page for EB-04 (404) and its `products/op17.html` is a 343-byte title-only stub, so those two lines are written from Bandai's EN card list instead and cite it (`cardlist/?series=569115`, which lists EB04-001 … 010 and 042 … 061, series 569114 holding the rest; `cardlist/?series=569117` for OP-17). OP-18 has neither and has no line. EB-05 gained a row for its line: Bandai's EN page gives the release as October 2026 with no day, so `enReleased` stays null, `cardsPerPack` is 12 as the page states, and there is no JP page yet (404 on 6 Sep 2026). The rules a line obeys, all enforced by `npm run seed:check`: at most 22 words, present tense, one sentence, a finite verb before any semicolon, no line opening on a noun and colon, no rarity / alt-art / campaign / anniversary words, no superlatives, no exclamation mark, and every one of the set's leaders named or none of them; leaders were read from Bandai's EN card list per set (series ids 569101 … 569117, 569201 … 569203, 569301 / 569302) and matched Limitless's attributes on all 23 sets. Names are written as Bandai prints them (`Monkey.D.Luffy`), a quoted epithet dropped (`Eustass Kid`); OP-15's leader printed `Lucy` is written `Sabo as Lucy`. The refresh never writes prose; a newly seeded set is a `seed:check` warning until someone writes its line from Bandai's page.

## Wiki lines (`data/wiki/lines.json`)

One Piece Wiki text, CC BY-SA 3.0, fetched 6 Sep 2026 by `npm run wiki:refresh` (`scripts/wiki-refresh.mjs`). Two parse calls per Character or Leader name (section 0 and `Template:<Title>_Tabs_Top`), 120 ms apart, `User-Agent: Piecebook/1.0 (+https://github.com/najibjuraimi-glitch/piecebook)`. Never an image. Each entry carries the wiki title, a revid permalink, a birthday when the Char Box parsed one, a spoiler-gated first sentence (debut-arc cutoff, clause by clause on `chap=`), and the cleaned clauses so a later reader cutoff can recompute the line. A redirect that adds a later name (`Imu` → `Nerona Imu`) is treated as a reveal and the app shows nothing. First cache: OP-01, OP-09, OP-17 and every leader (214 names asked, 188 mapped, 40 lines, 169 births). `seed:check` fails a line over 22 words and warns after three silent days. Attribution in the UI is `From One Piece Wiki, CC BY-SA 3.0` with a licence link only.

## Method

1. Verified EN set names (Bandai + Limitless + OPTCG allSets).  
2. Fetched Limitless EN full set pages; parsed each `card-page-main` block.  
3. Took USD from `tr.current` in the prints table (correct parallel price, not the base row).  
4. Mapped rarity codes; AA/Manga → base rarity; Special Card → `SP`; Treasure Rare → `TR`.  
5. Wrote CSVs under `/workspace/op-collector/` plus this sources log and `README-gaps.md`.
6. (2026-09-05, remaining 20 sets) Re-ran steps 2–4 with one parser for every set, validating it first by regenerating OP-09 / OP-16 and diffing against the committed CSVs (identical card numbers, names, rarities and image URLs). Kept same-set rows only, wrote `data/{code}-en-seed.csv`, flipped each roster row to `cardSeedStatus: ready`.
7. (2026-09-05, second pass) Rebuilt `prb01` / `prb02` with every print on the page (rarity chain: official label → base rarity on the same page → base rarity from the base set's CSV → `P` for promo numbers) and assembled `eb04` from the EB04-numbered rows on the OP-14 / OP-15 / OP-17 pages. Added the EB-04 roster row.
8. (2026-09-05) Ported the scrape to `scripts/seed-refresh.mjs` (`npm run seed:refresh`, Node, no dependencies) with the same rules; a hosted set such as EB-04 is now assembled from every fetched page, which is how `EB04-054p1` (filed on the OP-16 page) was found. Each run appends one row per priced card per day to `data/price-history/{code}.csv` (`card_number,as_of,market_usd`; same-day re-runs replace that day's value) and repins `data/SEED-VERSION.txt`. It never edits Cards' roster.
9. (2026-09-05) `npm run seed:backfill` (`scripts/seed-backfill-tcgplayer.mjs`), run once with Jib's approval: for each print in `data/tcgplayer-products.csv` (the TCGPlayer product id Limitless links from the print's current-price row; 3,298 of 3,301 unique cards, the 3 unpriced prints have none), `GET https://infinite-api.tcgplayer.com/price/history/{id}/detailed?range=annual` → 52 weekly buckets; the English / Near Mint SKU (variant Normal when several) is used, buckets with no market price are skipped, and each remaining bucket is appended to `data/price-history/{code}.csv` as `as_of = bucketStartDate`, `source = tcgplayer`. Days that already had a Limitless reading were left alone. The history header gained the `source` column at the same time (all earlier rows are `limitless`). This endpoint is what TCGPlayer's own product pages call, not a published API; it is used for this one backfill only and never by the daily workflow.

## EN sets roster (`data/sets-roster-en.json`)

One object `{ asOf, note, sets }`, file-level `asOf` 2026-09-04. 23 EN sets in `sets`: OP-01…OP-17, EB-01…EB-04, PRB-01…PRB-02, every row `product: booster_box` (EB-04 has no EN box; its row carries null prices and a `priceNote`). OP-13 is spelled `Carrying on His Will` (lowercase on), per Cards.

- `cardSeedStatus` is `ready` on all 23 rows as of 2026-09-05 (one CSV per set, table above; EB-04 added by Code with null prices, see Gaps). Box art is no longer vendored: since 5 Sep 2026 every box's image is TCGplayer's official product render, derived from `tcgplayerProductId` (`https://tcgplayer-cdn.tcgplayer.com/product/{id}_400w.jpg`, `_in_1000x1000.jpg`); `boxArtUrl` is `null` on every row and `public/box-art/` is gone.
- **Sealed box prices (Cards' 4 Sep 2026 hunt).** Every one of the 22 rows carries `usMarketUsd` (TCGPlayer market / identifiable Unopened English booster box ask, read 4 Sep 2026) with a per-row `asOf` of `2026-09-04` and the TCGPlayer product URL in `usSource` (e.g. OP-01 → product 557280, OP-17 → product 704752). `sgAskSgd` is set only where an SG ask was verified: OP-09 S$750 and OP-16 S$295; every other row keeps `sgAskSgd: null` and the UI never derives an SGD figure from USD. EB-02 carries a `priceNote` explaining which listing was used. Source URLs are provenance only; the app does not render them as links.
- **Starter decks (6.5, 5 Sep 2026): automated.** The 36 EN starter decks (ST-01 … ST-36, including the two Ultra Decks) are roster rows with `product: starter_deck`, generated from the same TCGCSV groups as the boxes: TCGplayer's group name minus its "Starter Deck N:" prefix, `publishedOn` as `enReleased`, and the single deck product's id (not the display case) as `tcgplayerProductId`, which gives the daily price row in `data/box-price-history.csv` and the render. Card lists, attributes and price history come from the Limitless set page (`st23-red-shanks` and so on) through the same refresh; a deck is a reprint product, so every print on its page belongs to it (the PRB rule, now `^(PRB|ST)-`). A deck's checklist is its distinct prints (ST-23: 15, the leader being the reprint parallel `OP09-001p2`); Bandai publishes the deck's total (51 cards, 10 DON!!) and rarity counts, not copies per card, and no automated source does, so the app never claims copies. ST-14 has no Limitless page and stays `pending`. Six of the newest decks (ST-31 … ST-36) list only the prints Limitless had at scrape time.
- **Box price feed (decision 3.1, 5 Sep 2026): automated via TCGCSV.** [TCGCSV](https://tcgcsv.com) is a public, once-a-day mirror of TCGplayer's own API (categories → groups → products → market prices); One Piece is category 68 and every EN booster box is a product with a `marketPrice`, the same figure Cards read by hand on 4 Sep 2026 (17 of 22 matched to the cent; the other 5 had moved in TCGCSV's later build). Each roster row now carries `tcgplayerProductId`, `tcgplayerGroupId` and `tcgplayerProductName` (the listing title, as a check). `npm run seed:refresh` (or `-- --boxes-only`) reads `last-updated.txt`, fetches each box's group prices once (`/tcgplayer/68/{groupId}/prices`), and appends one row per set to `data/box-price-history.csv` (`set_code,as_of,market_usd,low_usd,source=tcgcsv`; `as_of` is TCGCSV's build date; a same-day re-run replaces the row). Usage follows TCGCSV's guidelines: identified `User-Agent: Piecebook/1.0`, one pull a day from the workflow, 120 ms between requests, ~24 requests a run. The app shows the newest row; the roster's `usMarketUsd` / `asOf` are the fallback only. Limitless lists no sealed products (its `/products` is a 404), and reading TCGplayer's site directly stays ruled out. `npm run seed:check` validates the file and warns when the newest row is more than 3 days old or a box has no row. First rows: 22 boxes dated 2026-09-04.
- **Currency display (5.4, 6 Sep 2026): dated ECB cross, not a bank quote.** `data/fx-usd-sgd.json` is written by `npm run seed:refresh` from the European Central Bank euro foreign-exchange reference rates (`https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`, no key, `User-Agent: Piecebook/1.0`, one pull a day). The table is EUR-based; SGD per USD is EUR/SGD ÷ EUR/USD from the same daily cube, rounded to four decimal places, and the cube's `time` is the as-of date. First pull 4 Sep 2026 (Friday): 1 EUR = 1.1622 USD and 1.4724 SGD, so **S$1.2669 to US $1**. That cross is arithmetic on two published legs, not a published USD/SGD pair and not a bank quote. The cache stores both legs so the figure is auditable. The table is not published on TARGET holidays; `seed:check` fails a missing file or one older than 4 weekdays. Never invent a Saturday or Sunday print. MAS publishes a direct USD/SGD series and would be preferred for an SG reader; its public APIs were down or stale on 6 Sep 2026. Costs never convert; only the Portfolio reading uses the rate.
- OP-09 / OP-16 SG asks (S$750 / S$295) and their `sgSource` stay on the roster rows as provenance only: they were hand-read Carousell asks with no automated source and are not shown since 5 Sep 2026 (box-card addendum). `data/sealed-seed.json` was removed on 5 Sep 2026.
- EN set names and EN release dates (`enReleased`) were cross-checked across four independent release calendars that agree on every row:
  - https://samuraiswordtokyo.com/blogs/news/one-piece-card-sets-in-order
  - https://www.trackalacker.com/articles/news/one-piece-card-game-full-product-list
  - https://tcgking.nl/blogs/collecting/one-piece-card-game-release-schedule-2026-set-list
  - https://www.misprint.com/posts/one-piece-tcg-release-calendar
  - Official product pages (https://en.onepiece-cardgame.com/products/op17.html etc.) confirm names; their dates render client-side and were not scraped.
- **Upcoming sets (7.5, 5 Sep 2026): discovered automatically, codes read from TCGCSV's cards.** The TCGCSV step of `npm run seed:refresh` (also `-- --boxes-only`) reads every group in category 68 and, for any group not on the roster published within the last 30 days or in the future, its products; a group with a product named `… Booster Box` (not a Case) whose `presaleInfo.isPresale` is true becomes a roster row with `cardSeedStatus: pending`, TCGplayer's name (the box product name minus "Booster Box"; the app strips a leading "Extra Booster: " for display and reads it as the product type), `presaleInfo.releasedOn` as `enReleased`, and the box's `tcgplayerProductId` / `tcgplayerGroupId` / `tcgplayerProductName`; its presale market price is snapshotted into `data/box-price-history.csv` like any roster box (`as_of` is TCGCSV's build date, 2026-09-04 for the first rows). Groups with no such box (a Deck Set, promos, release event cards) are logged as warnings and never added. **The set code is TCGCSV's, not a guess:** the same group lists the revealed singles weeks before release, each with its card number in `extendedData` `Number` (`OP18-021`, `OP18-031`, `OP18-119` in group 24833; `EB05-005`, `EB05-007` … in 24820), so the code is the majority prefix of the group's card numbers (`OP18` → `OP-18`, `EB05` → `EB-05`, `PRB01` → `PRB-01`, `ST23` → `ST-23`; a reprint such as the `OP17-119` alternate art filed under OP-18 is outvoted), cross-checked against the group's `abbreviation` where TCGCSV has one (`OP18`, `EB-05`; a disagreement is logged and the cards win; some abbreviations are not codes at all, e.g. `EB-03-04`). The row records `codeSource: "tcgcsv-cards"` and `codeProvisional: false`, and the code is displayed like any set's. Only a group with neither card numbers nor a usable abbreviation gets a code by sequence (Extra Booster → `EB`, Premium Booster → `PRB`, otherwise `OP`, next number from the roster), `codeProvisional: true`, `codeSource: "sequence"`, never displayed; each later run re-reads that group's cards and probes `https://onepiece.limitlesstcg.com/cards/{code}` (a 200 whose title carries the code flips it to `codeSource: "limitless"`), and a code the cards correct is renamed in the roster and in `box-price-history.csv`. Once the set's checklist seeds the row turns `ready`. `npm run seed:check` validates `codeSource` and warns only on `sequence` rows. First rows, 5 Sep 2026: `EB-05` *Extra Booster: One Piece Heroines Edition Vol.2* (group 24820, box 711385, 30 Oct 2026, pre-order market US $399.95) and `OP-18` *The Dominance of God* (group 24833, box 712901, 20 Nov 2026, US $399.72), both codes confirmed from the groups' card numbers; Limitless returned 404 for both.
- Not included: starter decks and promos as sets of their own (ST / P cards appear only where a PRB box reprints them).

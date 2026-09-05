# Piecebook — V1 The box as a product: box card and box art (Design addendum)
As of: 5 Sep 2026 SGT  
Owner: Code as interim Cards, drafted from rendered mockups; approved by Jib 5 Sep 2026 SGT  
For: Code (implement), Design (critique)  
Amends: `V1-SETTILE-AND-GRID-PRICES.md` § Sealed seed, § SetTile, § SealedStrip; `V1-SETS-ROSTER-UI.md` § Sets home, § Set detail; `V1-OWN-AND-SET-DEPTH-UI.md` § Set detail stack (SealedStrip → BoxCard; SetIntro loses the pack line); `V1-DESIGN-PACK.md` § Components (SealedStrip)  
Growth map: 3.2, 3.3 (follows decision 3.1: box prices are automated, daily, from TCGplayer via TCGCSV)

## Why
A booster box is the product a collector actually buys, and since 3.1 its price moves daily like a card's. It deserves the same treatment as a card: one quiet product card with the official image, the market figure with its date, and the facts printed on the box. Nothing manual is left in the sealed story: no hand-read prices, no hand-supplied photos.

## Tokens
Unchanged. Paper, ink, muted, line; good / bad only on the signed movement figure. No accent.

## 3.2 BoxCard — set detail
Replaces the SealedStrip at the top of set detail, under the BackBar.

- Left: the box render on white (`object-contain`, rounded 12), 96px on phone, 144px from tablet. Type-first (`OP-09` on tinted paper) only when the image fails.
- Right, top to bottom:
  - Label **EN BOOSTER BOX** (section meta style).
  - `$669.52` (24px, tabular) with `as of 4 Sep 2026` muted beside it. This is TCGplayer market, read daily; the label matches the card page's figure, not a retail ask.
  - Movement line, muted: `TCGplayer market · read daily since 4 Sep 2026` until a second daily point exists, then `−$3.40 since 28 Aug 2026` (signed figure in good / bad; same rule as card detail, 30-day reference).
  - Rule, then the box's own facts in one muted line: `24 packs · 12 cards per pack · JP box 新たなる皇帝`. Only what Cards' intro carries; nothing inferred.
- Release dates are **not** on the card; **About this set** below keeps theme, `EN · 13 Dec 2024 · JP · 31 Aug 2024` and `130+1 card types`, and drops the pack line (moved up).
- Sets with no EN box (EB-04): label **SEALED**, the existing line `No EN box · cards ship in OP14-EB04 (16 Jan 2026) and OP15-EB04 (3 Apr 2026)`, the JP box title beneath, no image.
- No buy, seller, case or pack prices, no percent, no chart yet. A box price line becomes possible once daily points accumulate; separate addendum.

## 3.3 Box art — tiles and card
- Every box uses TCGplayer's official product render (Bandai's display-box image), served from TCGplayer's CDN the way card art is served from Limitless's CDN: `…/product/{id}_400w.jpg` on tiles, `…/product/{id}_in_1000x1000.jpg` on the card. Keyed by the `tcgplayerProductId` on the roster, so a new set gets its art the day its roster row exists.
- SetTile art band stays 3:2 but the render is **contained on white** with 12px padding rather than cropped (the renders are square product shots with their own margins). Type-first tinted paper remains for a set with no product id (EB-04).
- Consequence: the vendored closed-box photo for OP-09 retires so all 23 tiles share one style; `public/box-art/` goes.
- Rule change from `V1-SETTILE-AND-GRID-PRICES.md`: "closed EN booster box front on white, supplied and cleared by Cards / Design, vendored, never hotlinked" becomes "official TCGplayer product render, hotlinked, automated". Basis: the same standard-practice acceptance Jib gave for card images and card text on 5 Sep 2026.

## SG ask
Retired from the UI. `S$750` / `S$295` were hand-read Carousell asks with no automated source; under "anything manual should not be considered" they cannot stay current. Tiles read `Box · US $669.52 · as of 4 Sep 2026` for every box; the roster keeps `sgAskSgd` / `sgSource` as provenance only and the About-prices copy no longer mentions SGD.

## Decisions (approved 5 Sep 2026)
1. SG ask retired; TCGplayer market only, like cards.
2. Official TCGplayer renders hotlinked for all boxes; vendored OP-09 photo retired; "cleared photo" rule replaced.
3. Dates leave the box card (intro keeps them); pack facts move from the intro to the card.
4. Movement line wording: `TCGplayer market · read daily since 4 Sep 2026` until two points exist.
5. EB-04 card: **SEALED** label, no image.

## Out of scope
Box price chart, case and pack prices, JP box prices, marketplace or affiliate links, SGD.

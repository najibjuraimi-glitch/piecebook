# Piecebook V1 — Pre-grade + Grade-worth
(Design addendum, free first slice; approved by Jib 16 Oct 2026)

Owner: Code  
For: Jib  
Covers: Phase 11 slices 11.1–11.4 at the free level  
Reads with: `V1-DESIGN-PACK.md`, `docs/OBJECTIVE.md`, `docs/growth-map.csv`  
ClickUp: https://app.clickup.com/90182837848/v/l/li/1100400000006328

## Rule
Photos can rule out a PSA 10. They never confirm one. Piecebook never buys, bids or offers.

## Phase (four slices)
| Slice | This build (free) | Later on the same row |
|---|---|---|
| **11.1 Ingest** | Photo upload (front/back) for a Piecebook card ID; snapshot in the local log | eBay URL ingest and a listing snapshot |
| **11.2 Photo pre-grade** | Browser centering plus a capped vision Worker: corners, edges, surface; `identify.language` from the card text (EN / JP / CN / KR / FR or null). Photos can rule out a PSA 10 but never confirm one. Never auto-pick a card. | P(10) band low &lt;20% / mid 20–40% / high 40%+; surface cap to mid with no angled photo |
| **11.3 Grade-worth math** | Typed PSA pop and solds; PSA fee config; cost in; drift; three exits; EV; max buy; Go / Borderline / No-go | — |
| **11.4 Prediction log** | `localStorage` log, locked once marked submitted; grade entry later | Calibration table (predicted vs actual) |

**Phase 12 (next, not this PR):** Goldin ingest + batch sweep. Do not build now.

| Slice | What it is |
|---|---|
| **12.1 Goldin ingest** | Accept a goldin.co item URL. Pull photos and the current bid. Add about 22% buyer's premium to cost-in — inferred from one listing (US$325 hammer → US$397 total); verify per listing, not a published schedule. Example: `https://goldin.co/item/2025-one-piece-3rd-anniversary-treasure-campaign-pack-st21-014-monkey8m5y2`. Goldin needs a **server-side browser render**. |
| **12.2 Batch sweep** | An eBay search URL or a card list. Run every raw listing through pre-grade and grade-worth. Return a ranked list of Go and Borderline picks with max prices. Centering first; skip vision calls on fails; cache by image hash; cap batch size; track spend per month. |

Later still: auto PSA pop pulls, cert auto-match.

No paid APIs in the Phase 11 free slice. No API keys. No scraping.

## On the glass
- `/pregrade` — check photos first (front required, back optional), then confirm a suggested card; or type a Piecebook card number; the prediction log. Detected language sits next to the suggestion. If it is not EN, a note that Piecebook currently only has English card data and prices.
- `/pregrade/:cardNumber` — the worksheet. Reached from a confirm tap, from **Pre-grade this copy** on the card, and from the log. The AI guess sits next to centering.
- Quiet paper, ink, one accent on **Mark submitted**. No marketplace chrome. No percent badges.
- Seed market on the card is shown as seed, dated, and never treated as a sold.

## Centering
Ratio = larger / sum per axis. The worse axis counts. Front over 55/45 or back over 75/25 means this copy cannot be a 10. Overlay prints the four shares and the two splits. A photo that is cut off, angled over ~8° (a clear keystone), or whose short side is under 800px is rejected, and the line names the photo.

## Photo check (Worker)
Public Worker `VISION_URL` (`src/config/vision.ts`). `GEMINI_API_KEY` is a wrangler secret only — never in the repo. Daily KV cap; 429 falls back to typing a number. The model returns `identify.language` from the printed text, not the set code. A confirmed card feeds the existing grade-worth worksheet unchanged. After merge the Worker must be redeployed so the live `/check` schema includes `language`.

## Math
- Starting 10-rate = typed PSA 10s / total. Photos may set P(10) to 0. They never raise it.
- Cost in = raw + ship to Portland + grading fee + ship to PSA.
- PSA tiers in `data/psa-fees.json` with a last-checked date: Standard US$59.99 to US$1,000 declared, Priority US$79.99 to US$1,500, Express US$199 to US$2,500. Bump to Priority when the typed V10 is over US$1,000.
- Drift on V9/V10: −2%/mo when the EN release is within 12 months, else 0. 4 or 5 month turnaround.
- EV = P10·V10 + P9·V9 + rest·(V8 or raw), after drift on V9/V10.
- Max buy = highest raw where EV ≥ 1.2× cost in and a PSA 9 still about covers raw (drifted V9 ≥ 95% of raw).
- Exits: eBay vault-sell (~13% fees, labelled typical, not a quote); ship to SG (vault withdrawal US$19.99 under 500 / 24.99 for 500–4,999 + typed Buy&Ship + 9% GST); keep (drifted value in USD and at the dated ECB S$ cross).
- Nami ST01-007 at US$256 raw, on the labelled worksheet, is No-go.

## What we will not do
- Invent a sold, a pop, or a shipping figure.
- Confirm a PSA 10 from a photo.
- Buy, bid, or offer.
- Pull PSA pop, eBay, or Goldin in this slice (Phase 12 is the map row for Goldin and batch).

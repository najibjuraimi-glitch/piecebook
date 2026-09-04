# Piecebook — V1 Design Pack
As of: 4 Sep 2026 SGT  
Owner: Design  
For: Code (implement), Cards (PM/data)

## Product name
**Piecebook.** Use this as the wordmark and browser title. Do not ship “Collector” or “One Piece Collector” as the primary UI name.

## Model pick (Design)

**Choice: Claude Fable 5.1** (`claude-fable-5-1`) for design-critical Cursor Cloud Agent / IDE UI work.

**Why (short):** Independent 2026 UI comparisons put Fable ahead on visual judgment, quiet polish, and reading an ambiguous “beautiful and dead simple” brief without stuffing the chrome. That matches our bar against cluttered TCG collector sites. Jib already locked Fable 5.1 for Rocky/visionOS via Code, so this reuses an approved model instead of a new subscription.

**How it maps here:**
- Grok Bot chat with Design has no per-agent model picker in settings. Specs and critique in this chat run on Grok Bot’s own allowance.
- When Code (or Design via Code) launches a Cloud Agent to implement or refine UI from this pack, pass `model: claude-fable-5-1`. Prefer thinking on, effort high for visual system work.
- Day-to-day cheap passes can stay on Cursor Grok 4.6 / Composer 2.5 (Cursor Models pool). GPT-5.6 Sol is stronger for pure reliability; Gemini 3.1 Pro is fine for mockup-to-code. Neither beats Fable 5.1 on first-pass taste for this product.
- Cost: Fable draws from Other Models (~2× Opus). No new subscribe. Do not burn Fable on data scaffolding. Ask Jib before heavy on-demand spend.

## Anti-patterns (what we are not)
Do not ship dense multi-column price tables, ad banners, stacked toolbars, chip spam, or competing CTAs. Card art and type carry the screen. One primary action per screen.

## Information architecture

### Global nav (phone web)
Bottom tab bar, four tabs only:
1. **Sets** → home set list
2. **Collection** → owned list
3. **Portfolio** → value summary
4. (omit search / scan / account in V1)

Top chrome: app wordmark left (“Piecebook” strong; no One Piece trademark in chrome) OR bare screen title. No hamburger. No secondary toolbar.

### Routes
| Route | Screen |
| --- | --- |
| `/` | Home set list |
| `/sets/:setCode` | Set detail (rarity tabs + sealed) |
| `/cards/:cardNumber` | Card detail (Own / cost basis) |
| `/collection` | Collection |
| `/portfolio` | Portfolio |

Back: native browser back + in-app chevron on detail screens. Deep links work for cards and sets.

### Ownership model (local only)
Browser `localStorage` (or IndexedDB if Code prefers). Keys: owned flags, qty, cost basis lots `{ cardNumber, qty, paidUsd, paidOn, note? }`. No accounts. Seed CSV is read-only catalog; user data never invents prices.

## Visual direction

### Palette
Quiet paper, not neon anime chrome.
- `--bg`: `#F7F5F0` (warm paper)
- `--surface`: `#FFFFFF`
- `--ink`: `#1A1A1A`
- `--ink-muted`: `#6B6560`
- `--line`: `#E6E1D8`
- `--accent`: `#C45C26` (one warm accent for primary CTAs only; think sealed wax, not Bandai blue spam)
- `--good`: `#1F7A4C` (portfolio gain)
- `--bad`: `#B42318` (portfolio loss)
- `--rarity-L` / `SEC` / `SR` / `R` / `UC` / `C`: soft tint chips, low saturation; parallels use a thin gold ring on the card art frame, not a screaming badge wall

Dark mode: defer. V1 ships light only.

### Type
- UI sans: `Inter` or system UI stack (`ui-sans-serif, system-ui, sans-serif`)
- Display for set titles: slightly tighter tracking, weight 600–700
- Scale (mobile base 16px):  
  - Display: 28/34  
  - Title: 22/28  
  - Body: 16/24  
  - Meta: 13/18 muted  
  - Tab label: 11/14
- Numbers (prices, P/L): tabular lining figures; never mix decorative fonts on prices

### Spacing
- Page padding: 16px sides, 24px top under status
- Vertical rhythm: 8 base; section gaps 24–32
- Card grid gap: 12
- Generous whitespace around art; prefer empty paper over a second widget

### Layout
- Max content width: 480px centered on larger viewports (phone-first column, not a desktop dashboard)
- Thumb zone: primary CTA fixed or sticky in lower third, above the tab bar (safe area inset)
- Touch targets: min 44×44

### Components (minimal set)
1. **SetTile**: large, ~3:4 or full-bleed set key art if available; else big `OP-09` type on paper. Subline: set name + card count. Tap → set detail.
2. **RarityTabs**: horizontal scroll chips (Leader, SEC, SR, R, UC, C, Parallels). Selected = filled ink, others = outline. Sticky under sealed strip.
3. **SealedStrip**: one quiet banner under set title; short text from Cards’ `sealed_guidance`; no carousel.
4. **CardCell**: art (prefer `image_url`), name, number, rarity chip, optional owned checkmark. Tap → card detail.
5. **PrimaryButton**: accent fill, full width in thumb zone (“Mark owned”, “Save cost”).
6. **GhostButton**: outline for secondary (“Add cost basis”, “Remove”).
7. **StatBlock**: large number + muted label (Portfolio).
8. **EmptyState**: short sentence + one CTA (e.g. “No owned cards yet. Browse Sets.”).
9. **TabBar**: 3 icons + labels; active = ink, inactive = muted. No badges in V1.

Motion: 150–200ms ease; no bounce. Image fade-in only.

## Screen-by-screen UX

### 1. Home — Sets (`/`)
**Job:** Pick a set in one tap.

**Layout (top → bottom):**
- Title: “Sets”
- Soft subline: “Browse by OP number”
- Vertical list of SetTiles (start: OP-09, OP-16 from seed). Order by set code ascending.
- Each tile shows: set code (hero), set name, language hint if mixed later (V1 EN seeds), count of cards in seed.

**Primary action:** Tap a set.

**Copy:**
- Title: Sets
- Empty (should not happen if seed loads): “No sets loaded yet.”

**Do not:** filters, sort menus, ads, “trending”, search in V1.

### 2. Set detail (`/sets/:setCode`)
**Job:** See sealed guidance, then browse rarity buckets.

**Layout:**
- Back + set code as title; set name as muted subline
- **SealedStrip** with Cards’ guidance text (EN box / JP box notes). Label: “Sealed”
- **RarityTabs** sticky
- Grid of CardCells (2 columns on phone) for the active rarity
- Parallels: either a Parallels tab (card_number contains `p`) or a toggle “Show parallels” default off for base checklist clarity. Prefer a **Parallels** tab so Leader/SEC stay clean.

**Primary action:** Tap a card.

**Copy:**
- Sealed label: Sealed
- Tabs: Leader · SEC · SR · R · UC · C · Parallels  
  (Map seed rarities: L→Leader, and show only tabs that exist in that set.)
- Empty tab: “No cards in this rarity.”

**Do not:** inline prices on every cell (keeps grid calm). Owned state = small check on art only.

### 3. Card detail (`/cards/:cardNumber`)
**Job:** Own the card; optionally log cost basis.

**Layout:**
- Back
- Large card art (full width, rounded 12, paper shadow subtle)
- Name (title), number + rarity + language (meta row)
- Seed market: “Market (seed)” + `market_usd` + “as of {as_of}”. Label makes clear it is seed, not live.
- Ownership block:
  - If not owned: PrimaryButton “Mark owned”
  - If owned: state “Owned” + Ghost “Remove from collection”
- Cost basis block (visible when owned, or behind Ghost “Add cost basis”):
  - Fields: Amount paid (USD), Date, optional Qty (default 1), optional Note
  - PrimaryButton “Save cost”
- No charts. No “similar cards”. No seller links in V1.

**Primary action:** Mark owned (or Save cost when editing basis).

**Copy:**
- Market (seed)
- Mark owned
- Remove from collection
- Add cost basis / Save cost / Edit cost
- Amount paid (USD)
- Date
- Note (optional)

**Do not:** invent prices. If `market_usd` missing, show “No seed price” and still allow Own + cost.

### 4. Collection (`/collection`)
**Job:** See what you own; jump back to a card.

**Layout:**
- Title: Collection
- Count subline: “{n} cards”
- List or 2-col grid of owned CardCells (art + name + number). Sort: newest owned first, else by set then number.
- Tap → card detail

**Primary action:** Tap a card to edit ownership/cost.

**Empty:** “No owned cards yet.” CTA button “Browse sets” → `/`.

**Do not:** bulk edit, filters, CSV export in V1.

### 5. Portfolio (`/portfolio`)
**Job:** One glance at value vs cost (seed-based).

**Layout:**
- Title: Portfolio
- Three StatBlocks stacked (not a dense table):
  1. Market value = sum(seed market_usd × qty) for owned
  2. Cost basis = sum(paid)
  3. Unrealized P/L = market − cost (green/red)
- Muted footnote: “Values use Cards’ seed prices, not live market.”
- Optional short list: top 5 owned by market value (name + value). Tap → card. If none owned, hide list.

**Primary action:** None competing; footnote honesty. Secondary: tap a row to open card.

**Empty:** “Log owned cards with cost to see portfolio.” CTA “Browse sets”.

**Do not:** charts, time series, alerts, currency switcher (USD seed only in V1).

## UX copy sheet (implement as-is)
- App name in UI: Piecebook (wordmark); browser title: Piecebook
- Tabs: Sets | Collection | Portfolio
- Buttons: Mark owned | Remove from collection | Add cost basis | Save cost | Browse sets
- Labels: Sealed | Market (seed) | Amount paid (USD) | Date | Note (optional) | Market value | Cost basis | Unrealized P/L
- Footnote: Values use Cards’ seed prices, not live market.

## Code implementation notes
- Stack suggestion (non-binding): Next.js or Vite + React, Tailwind, shadcn-style primitives only where they stay quiet. Prefer custom SetTile/CardCell over dense DataTable.
- Images: use `image_url` from seed; placeholder paper rectangle with card number if broken/missing.
- Rarity tab order fixed: L, SEC, SR, R, UC, C, then Parallels.
- Parallel detection: `card_number` contains `p` (e.g. OP09-001p1) unless Cards amends the contract.
- Persist locally; wipe = user clears site data (mention nowhere loud in V1).
- Accessibility: focus rings, alt text = “{name} {card_number}”, contrast AA on ink/paper.

## Handoff
Cards: keep feeding real seed rows + sealed_guidance; Design will not invent lists or prices.  
Code: scaffold data from CSVs in parallel; UI must follow this pack. Prefer Cloud Agent model `claude-fable-5-1` for UI implementation passes.  
Design: available for critique once first screens render.

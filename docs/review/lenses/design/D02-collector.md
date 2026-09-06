# D02 — Collector / shopper

**Seat.** Collector / shopper. I arrived from Collectr’s One Piece grid (Cards Only, Price high to low, chase tiles, Shop, +). I want to find a card or a box, read a dated seed, and buy the same product somewhere else. Not a cart. Not Collectr chrome.

**Glass read.** `docs/review/lenses-v2/phone-start.png`, `phone-sets-fold.png`. `src/screens/Start.tsx` (v3 draft on this branch). `docs/V1-DESIGN-PACK.md`. Brief: `docs/review/lenses/design/BRIEF.md`.

## First impression of current Start (v2 on the glass)

A warm paper page: Piecebook, a search that already says `Find a card or a box`, then three text doors titled COLLECT / PLAY / WORLD. There is no box, no card, no seed, no One Piece product face — only house words and a chevron.

I came from a wall of card art and dollars. This reads as a contents page for an app I already know, not a place that has cards and boxes. I only learn the find-job if I read the Collect sentence or trust the search placeholder.

## Collectr as a place

Collectr’s One Piece home is instantly a card shop: Find a Product, Shop in the header, a cart on the phone, a two-up chase grid sorted Price high to low. Every tile is art plus a large USD, a green or red %, and a +.

I know in one glance that cards live here and that money is the point. I do not get a dated seed I can defend at a counter, and the first faces are SAMPLE-watermarked trophies, not a box I would actually buy.

## Bandai Asia as a place

[Bandai Asia](https://asia-en.onepiece-cardgame.com/) is instantly the One Piece TCG: the official name in the title, anniversary hero, booster and starter product shots (OP-17, ST-32…ST-36), Decks / Boosters / Other, events, news.

I know I am on the maker’s site. I do not get a seed price or a way to look up a single and take a date to a shop — I get product marketing and a calendar.

## Top 5 homepage changes for this job

1. **High — Put a real box on the find door.** v2 Collect is type only. The first picture on Start must be an EN booster box we already serve (TCGplayer CDN, same render as Sets tiles). Letterbox on white, `object-contain`, no accent, no SAMPLE, no +, no cart. Without that face I do not know products live here.

2. **High — Big type is the job, not COLLECT.** Headline: **Find a card or a box**. COLLECT stays the muted house label (tabs and `/belong` stay). v2’s Collect sentence leads with “what you have and what it is worth today”; ownership is the second room. Find first.

3. **High — Name the TCG under the wordmark.** v2 is “Piecebook” then search. One ink line: `One Piece cards. Prices, the game, and the story.` Design Pack forbids One Piece in chrome; this is body copy, not a trademark wordmark. Without it I could be in any paper notebook.

4. **Med — First fold is the find door, not three pictured doors.** A 3:2 box band will not leave room for Play and World above the fold on 390×844. That is correct for this job: search + one pictured find door, Play clipped. Do not shrink the box to keep all three headlines on glass.

5. **Low — No hero dollar and no Buy on Start.** The dated seed is already on Sets (`Box · US $207.42 · as of 4 Sep 2026` on the cheapest released box). Printing a large USD on the door would ape Collectr. The door may *say* “dated seed prices” in the sentence. It must not grow a cart, checkout, Shop tab, or accent fill.

## 3 things to keep

1. **Search `Find a card or a box`** — already the visitor sentence; keep it first, same field that marks started and opens `/?q=`.
2. **The trust stack** — “Nothing here is invented… Read how prices work.” plus the unofficial line. That is how I know I will buy somewhere else.
3. **The Sets tile** — TCGplayer box, EN SET · code, name, card count, `Box · US $… · as of`. That is the room this door opens (`phone-sets-fold.png`). No cart there either.

## One trade

Collectr spends the first fold on a shop grid (the wrong pictures: chase singles, Shop, +). Piecebook should spend it on one honest box face and refuse the chrome that would also “look like shopping.” We lose three-jobs-on-one-fold. We gain a door that is obviously find-a-product, then a dated seed on the next page.

## First fold (390×844)

Above the tab bar, top → bottom, 16px sides, paper `#F7F5F0`:

1. **Piecebook** — display, ink. Not “Collector”.
2. **One line** — `One Piece cards. Prices, the game, and the story.` Body, ink, ~40ch.
3. **Search** — existing field, placeholder `Find a card or a box`. Not a Shop button.
4. **The find door** — surface card, `border-line`, `shadow-paper`, radius 16, **no accent**.
   - Top band: OP-16 EN booster box, aspect 3:2, white letterbox (same as a set tile).
   - Meta: `COLLECT` — 13px, uppercase, tracking, muted. Not the headline.
   - Title: **Find a card or a box** — 22/28, ink.
   - Sentence: `Every English set, with dated seed prices. Then what you have and what it is worth today.`
   - Chevron muted, self-center.
5. **Play door** may clip. World and the trust lines sit below the fold.
6. **Tab bar** — Sets · Collection · Decks · Portfolio · World. Nothing lit on `/start`. Labels unchanged.

Tap the door → `/` (Sets). The first Sets fold already shows the box and the dated seed. I screenshot that line and buy elsewhere.

## Door titles (visitor language)

Pillar words stay muted house names. Big type:

1. **Find a card or a box**
2. **Learn to play**
3. **Story, people, fruits**

## Collect path — title and image

**Title.** Find a card or a box.

**Image.** The cheapest released EN booster box we already paint on Sets — today **OP-16 The Time of Battle**, TCGplayer product `689336`:

`https://tcgplayer-cdn.tcgplayer.com/product/689336_400w.jpg`

Same `boxImageUrl` / `cheapestReleasedBox()` path as the Sets “cheapest box” jump. Fallback if that helper is empty: OP-01 Romance Dawn, `557280` → `https://tcgplayer-cdn.tcgplayer.com/product/557280_400w.jpg`.

**Why this box, not a card.** Collectr already taught me that a first-screen card is a chase ticker. A sealed box is the anti-Collectr signal: products, not SAMPLE trophies. OP-16 is a current shop-window box (~US $207.42 seed, 4 Sep 2026), not Romance Dawn’s US $1,468.78 — that sticker looks like Collectr’s fantasy tape. The title carries “card”; I do not need a second picture.

**Do not put on this door.** `OP01-003` Monkey.D.Luffy (`https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/OP01/OP01-003_EN.webp`) — that Limitless print is the story door, not find. ST-08 (`502975`) / ST-21 (`606575`) starter boxes are the learn path. No wiki art. No fruit art. No invented collage of box + card. No accent wash on the band.

The v3 draft in `Start.tsx` already points this way (find title, `FIND_BOX = cheapestReleasedBox()`, no accent). v2 glass still does not. Ship the pictured find door; do not add a cart to finish the sentence.

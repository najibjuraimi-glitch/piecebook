# D01 — First fold / new browser tab

Seat: I typed a URL. I do not work here. I do not know Collect, Play, or World.

## Current Start (v2 glass)

A quiet paper page named Piecebook: a search that says “Find a card or a box,” then three white doors titled COLLECT, PLAY, and WORLD, then a trust line and an unofficial footnote. There is no card, no box, and no “One Piece” above the fold — I would not know this is the card game, a place to look something up, or a place about the story.

## Collectr as a place

Collectr is instantly a card shop window: One Piece card faces in a grid, huge USD, green and red percents, SAMPLE stamps, Shop in the header, a cart icon on the phone. I know in one glance that people come here to look up what a print costs.

It is not a place I would sit down to learn a turn, and it is not a place about the story. Do not become this — no cart, no %, no SAMPLE, no + on a tile.

## Bandai Asia as a place

Bandai Asia (`https://asia-en.onepiece-cardgame.com/`) is instantly the One Piece Card Game: the title says so, the hero is anniversary and product, and the page is decks, boosters, events, a beginner guide. I know this is the official TCG, not a wiki and not a price tracker.

It is a storefront and a fest funnel. Do not become this — no official shop, no buy button, no event chrome, no teaching-app banner.

## Top 5 homepage changes (this job)

1. **High — Name the place in ink, then prove it with prints we already serve.** Under the wordmark, one line: “One Piece cards.” (a second clause, “Prices, the game, and the story,” may wrap). On each door, a scrap of existing product art — TCGplayer box CDN or Limitless card CDN — so the first screen is cards, not a notebook of house words. No wiki images. No fruit pictures.

2. **High — Make the door headlines visitor jobs, not pillars.** Collect / Play / World may stay as a muted 13px eyebrow (tabs and `/belong` do not move). The big type must answer the three questions I walked in with: where do I find a card or a box; where do I learn the TCG; where do I read about the people and the fruits.

3. **High — Fit all three jobs on a 390×844 fold.** Do not stack three SetTile-style 3:2 art bands. At ~358px content width that is ~240px of picture per door; Learn and Story fall off the first screen and I still only know one place. Use a horizontal chip (about 96×96, letterboxed on white like a set tile) plus title, so three doors stay above the tab bar.

4. **Med — Keep search where it is, and do not put a price on it.** “Find a card or a box” is already the find action. A seed dollar, a %, or a “buy” on Start would read as Collectr. The dated seed lives on Sets, after I have chosen find.

5. **Low — Push trust, legal, and “Just show me the sets” below the fold.** I need those after I know the place, not instead of knowing it. The “New to the game?” line can stay under the doors if it still fits; it must say “Learn to play,” not “Play.”

## 3 things to keep

- Quiet paper and ink. No cart, no checkout, no buy, no Collectr SAMPLE / % / + chrome. Accent stays off the Start doors (wax is for a later primary, not these three).
- The search field and its copy. It already speaks find, not Collect.
- Tab labels as shipped (Sets · Collection · Decks · Portfolio · World), the `/belong` route, and World as the house name in chrome.

## One trade

Recognition versus empty paper — and versus a lush box hero. We put three existing prints on Start so a stranger knows the place, and we keep them as chips so all three jobs stay on the first phone screen. We give up the all-type calm of today’s doors, and we give up SetTile’s tall 3:2 band on this page.

## First-fold layout — 390×844, above the tab bar

Content column 16px sides. No door uses `--accent`. Surfaces stay `--surface` on `--bg`, `--line` border, ink type.

| Y (approx.) | What |
|---|---|
| 24–88 | **Piecebook** (display, ink). Under it, body ink: **One Piece cards.** Optional wrap: “Prices, the game, and the story.” |
| 88–152 | **Search**, placeholder `Find a card or a box` — same field that already goes to `/?q=`. |
| 152–272 | **Door 1 — find.** 96×96 chip: OP-16 *The Time of Battle* booster box, `https://tcgplayer-cdn.tcgplayer.com/product/689336_400w.jpg` (product `689336`, the render Sets already uses). Letterbox on white. Title: **Find a card or a box**. One body line about English sets and dated seed prices. Eyebrow Collect. Opens `/`. No dollar on the chip. |
| 284–404 | **Door 2 — learn.** 96×96 chip: ST-21 *Gear 5* starter box, `https://tcgplayer-cdn.tcgplayer.com/product/606575_400w.jpg` (product `606575`). If that render is missing, ST-08 *Monkey.D.Luffy*, `https://tcgplayer-cdn.tcgplayer.com/product/502975_400w.jpg` (product `502975`). Title: **Learn to play**. One body line: rules in five sentences, then Bandai’s. Eyebrow Play. Opens `/learn`. |
| 416–536 | **Door 3 — story.** 96×96 chip: printed card `OP01-003` Monkey.D.Luffy, `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/OP01/OP01-003_EN.webp` (the Limitless file the card cell already shows). Crop from the top; it is a person on a card, not a wiki bust and not a fruit. Title: **Story, people, fruits**. One body line: the story, the people, the fruits, and the game — as far as you have read. Eyebrow World. Opens `/belong`. |

Below the fold: “New to the game? Learn to play in five sentences.” Trust line (TCGplayer / Limitless / Bandai). Unofficial line. “Just show me the sets.”

Tab bar unchanged; nothing lit on `/start`.

Why these three prints, and not OP-01 on the find door: I need three *kinds* of object — a shop-window booster box, a sit-down starter, a single printed person — so find / learn / story do not all read as “Luffy.” OP-01 Romance Dawn (`557280`, `…/product/557280_400w.jpg`) is the fallback if OP-16’s box fails to load; it is not the headline art, and its seed must stay off this page (that sticker is Collectr shock, not a welcome).

Wide (1280): the same three chips and the same three titles, in one row. Do not grow the chips into a Bandai product hero or a Collectr grid.

## Door titles (visitor language)

1. **Find a card or a box**
2. **Learn to play**
3. **Story, people, fruits**

No pillar word as the big type.

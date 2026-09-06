# D05 — Copy (visitor language)

Seat: Copy. New tab. Collect, Play, and World are house words. This file does not put them in the headline.

Glass read: `docs/review/lenses-v2/phone-start.png` and `src/screens/Start.tsx`. No accent on doors. Not a shop. No cart.

## First impression of current Start

Piecebook, then a search that already speaks, then three doors whose first readable word is Collect, Play, or World. A new tab cannot tell this is One Piece cards, a place to learn the TCG, or a place to read about people and fruits — only that we have three rooms with our names on them.

The one line that tries to help a newcomer says “Play has the rules in five sentences,” which assumes the pillar. There is no wordmark subline on the v2 glass. The source draft on this branch has started to add visitor titles and a subline; the lock below is the copy, not a new layout.

## Collectr as a place

Collectr is a shop floor: Shop in the header, a cart, Cards Only, Price high to low, SAMPLE on the art, a large USD and a + on every tile. You know you are in a card market. You do not know you are in the One Piece TCG as a game, or in the story.

## Bandai Asia as a place

Bandai Asia (`https://asia-en.onepiece-cardgame.com/`) is the official One Piece Card Game: anniversary, products, events, “A World of Treasure and Adventure Await,” starter decks and boosters by name. You know this is the TCG and the manga world. You are not here to look up a dated English box price, or what you own.

## Top 5 homepage changes (copy)

1. High — Put one subline under Piecebook that names One Piece cards, the game, and the story. v2 Start is a nameless ledger.
2. High — Make the door headlines visitor verbs or nouns. Collect / Play / World are not the big type.
3. High — Rewrite “New to the game? Play has…”. The line must send a stranger to the five sentences without speaking Play.
4. Med — One sentence per door body. Do not repeat the title. Do not say “seed” on the first glass (pipeline). Do not say shop, buy, or cart.
5. Low — Keep Collect / Play / World only as a muted eyebrow. Do not delete the house map. Do not promote it back to the title.

## Keep

- Search placeholder: `Find a card or a box`.
- Trust line and unofficial line, as written on the glass.
- “Just show me the sets” as a text link, not a button, not accent.

## Trade

A first glass that teaches our pillars versus a first glass a stranger can use. Spend the headlines on find, learn, and story. Keep the house words as muted eyebrows and in the tab bar (World stays chrome).

## First fold (390×844)

Paper. Ink. No accent. No cart.

1. Wordmark: Piecebook.
2. Subline (one line, body ink).
3. Search field, placeholder `Find a card or a box`.
4. Door 1, full: box art we already serve, muted Collect, visitor title, one-sentence body, chevron.
5. Top of door 2 if it fits (starter-box art). Learn may clip.

Below the fold: rest of door 2, door 3, “New to the game?”, trust, unofficial, Just show me the sets.

Tab bar stays: Sets · Collection · Decks · Portfolio · World. Nothing lit on `/start`.

The five-sentences link is not first-fold. Door 1 must do the find job alone. Door 2’s title must do the learn job if only its art shows.

## Door titles (visitor language)

1. Find a card or a box
2. Learn the game
3. People and fruits

No pillar word as the big type.

## Final copy block

Exact strings. Implement as-is.

**Wordmark subline**

```
One Piece cards. The game, and the story.
```

**Door titles** (big type)

```
Find a card or a box
Learn the game
People and fruits
```

**Door bodies** (one sentence each)

```
English sets with a dated price, then what you have and what it is worth today.
The rules in five sentences, then Bandai’s own, then a deck from your cards.
The story, the people, the fruits, and the game — as far as you have read.
```

**“New to the game?”** (link the second sentence)

```
New to the game? Learn to play in five sentences.
```

**Eyebrow**

Yes. Collect / Play / World may remain as a muted, uppercase, meta eyebrow **over** the title. Not the headline. Not under the title (the house map sits above the job, the job is the type that reads). Chrome already keeps World. Do not print them at title size.

**Do not print on Start**

Shop. Cart. Buy. Checkout. Seed. “Play has…”. Accent on a door.

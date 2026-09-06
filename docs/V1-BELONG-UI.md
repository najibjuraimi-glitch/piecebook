# Piecebook V1 — Belong: set stories, release timeline, Start here
(Design addendum, v2 after user research: ten simulated reviewers, 6 Sep 2026; rebuilt from the recorded decisions after the v1 branch was lost; approved by Jib 6 Sep 2026 SGT)

Owner: Code as interim Cards, drafted from rendered mockups and the ten-reviewer round; approved by Jib 6 Sep 2026 SGT  
For: Code (implement), Design (critique)  
Covers growth-map 7.1 (set stories), 7.2 (release timeline), 8.1 (Start here)  
Reads with: `V1-DESIGN-PACK.md` (paper, ink, one accent, no marketplace chrome, no invented data), `V1-SETS-ROSTER-UI.md` (Sets home, set detail), `V1-BOX-CARD-AND-ART-UI.md` (the box card the story now sits above), `V1-FIND-UI.md` (upcoming sets, whose dates), `V1-STARTER-DECKS-LINKS-LEARN-UI.md` (Learn to play, which Start here points at), `seed-sources.md`

## Why these three together
They are the fandom pillar's front door and its two rooms. A set is more than a checklist and a box price: it has a story from the manga and a place in time, in Japan first and in English later. Start here gives a newcomer the three doors (Collect, Play, Belong) in one screen, once. Everything below runs on data the repo already holds or on one sentence per set that a person writes from Bandai's own page and records with its source; nothing is scraped from a wiki, nothing is guessed.

## 7.1 Set stories
**One line per set**, in `data/set-intros.json` as `introTheme`, with `introSource` beside it: the Bandai EN product page the line was written from (`https://en.onepiece-cardgame.com/products/boosters/op09.php`; OP-14 and OP-15 use `op14-eb04.php` / `op15-eb04.php`, OP-16 `products/op16.html`, EB-05 `products/eb05.html`). Where Bandai has no EN product page the line cites Bandai's EN card list instead: EB-04 (never had one) and OP-17 (its `products/op17.html` is a 343-byte title-only stub, checked 6 Sep 2026). OP-18 has neither an EN page nor a card list and gets no line. EB-05 has an EN page and gets a row and a line, though Bandai gives its release as a month only, so the row carries no EN day.

**The rules a line obeys** (every one is checked by `npm run seed:check`, which fails the build on a breach): written from Bandai's page and never quoted; at most 22 words; present tense; one sentence ending in a full stop; a finite verb before any semicolon; no line opening on a noun and a colon; no rarity, alt-art, campaign or anniversary words; no superlatives; no exclamation mark; and it names **all** of the set's leaders or none of them. Leaders were read from Bandai's EN card list for every set (`cardlist/?series=…`) and matched Limitless's attributes on all 23; the check uses the seed's leader names, as Bandai prints them (`Monkey.D.Luffy`, `Marshall.D.Teach`), a quoted epithet dropped (`Eustass Kid`), and flags a line that names some but not all. OP-15's second leader is printed `Lucy`; the line says `Sabo as Lucy`, which is who it is.

**The 24 lines** (23 roster boosters and EB-05) are in the data file; three as they render:
- OP-02 — *The war at Marineford reaches the game, and black, which the Absolute Justice starter deck introduced, joins the boosters.* (Bandai's page: black "makes its first appearance in Starter Deck Absolute Justice [ST-06]".)
- OP-09 — *The new Four Emperors take the stage, Gol.D.Roger joins the game, and Shanks, Lim, Buggy, Monkey.D.Luffy, Nico Robin and Marshall.D.Teach lead.*
- OP-16 — *The war at Marineford returns by way of Impel Down, and Portgas.D.Ace, Monkey.D.Luffy, Buggy, Sengoku, Yamato and Marshall.D.Teach lead.*

**Set page.** The story sits directly under the set's name, in ink, body size, with no eyebrow (`About this set` is gone). Beneath it two meta lines: the dates, JP first then EN, in ink (`JP 4 Nov 2022 · EN 10 Mar 2023`); and the counts, muted, Bandai's card-types figure as printed against the prints we hold (`121 cards · 154 prints with alternate arts`; `126+1 cards · 147 prints …` where Bandai counts the DON!! card; prints alone where Bandai publishes no figure). The block comes before the box card, so the page reads set → box → cards; the box card keeps packs, cards per pack and the JP box title. An upcoming set with a line (EB-05) shows it under its name too, dates staying TCGplayer's in the header. The story appears on the set page only: not on tiles, not on timeline rows.

**Automation.** The refresh never writes prose. `seed:check` warns on a ready booster set without a line, so a newly seeded set is noticed the day it arrives and its line is written by hand from Bandai's page, like these.

## 7.2 Release timeline
**A view of Sets home**, `/?view=timeline`, switched by two text tabs in the title row to the right of `Sets`: **Tiles** and **Timeline**, active in ink with a hairline underline, inactive muted; a real `tablist` (`role=tab`, `aria-selected`, arrow keys move and select, Home and End jump, the active tab alone in the tab order; the list is its `tabpanel`). Nothing is remembered: `/` is the tiles for everyone, the timeline is a URL you can send. Search and its chips stay above either view, untouched.

**Caption**, under the tabs, in ink because it says whose facts these are: `English release order. EN dates are Bandai's; TCGplayer's US date where Bandai gives only a month.`

**The list.** Year jump chips (`2022 … 2026`, hairline chips, 44px targets) above; year rules as headings (`2022 ———`); a hairline **Today** rule between what is out and what is coming. Every booster, extra booster and premium booster on the roster in EN release order; starter decks are not on it. Each row is one link to `/sets/CODE`:
1. `OP-02 · Paramount War`, with `12 of 154` muted at the right edge only where the collector has started the set.
2. The dates in ink: `JP 4 Nov 2022 · EN 10 Mar 2023 · 4 months later`. The last clause qualifies the EN date: whole months when a month or more separates the two (`1 month later`), days under a month (`13 days later`; `15 days earlier` for EB-04, whose EN prints shipped before the JP box), `same day` only when equal. A set the refresh found on TCGCSV, with no Bandai day yet, reads `EN 20 Nov 2026 · US date`, and keeps saying so after release day until Bandai's date is recorded.
3. The JP name in muted type (`頂上決戦`), omitted where Bandai has not published it (EB-05, OP-18).

No prices, no stories, no art. `id="coming-soon"` sits on the first upcoming row so the `2 coming soon` jump still lands. The list is capped at a paragraph's width from tablet up rather than stretching with the tile grid.

## 8.1 Start here
**Route** `/start`. Shown once: a first visit to `/` itself, with nothing owned and the flag `piecebook.started.v1` unset, redirects to `/start` (replacing the history entry). The flag is set only by a door or by `Just show me the sets`; a session marker stops the redirect from repeating within one visit if the tab bar is used to leave instead. Deep links never redirect: `/?view=timeline`, `/?q=…`, any set, card, deck or page loads as asked.

**Screen.** The wordmark as the title, then three doors as cards, each with the pillar word as a muted eyebrow and its question in ink, a chevron, no accent on any of them:
- **Collect** — What you have and what it is worth today. → `/`
- **Play** — Learn the game in five sentences, build a deck from your cards, check it against the rules. → `/decks`
- **Belong** — Every set in order, who drew each card, who is on it, what is coming next. → `/?view=timeline`

Under them, in ink: `New to the game? Play has the rules in five sentences.` (the sentence links to `/learn`) and the trust line `Nothing here is invented: prices from TCGplayer, cards from Limitless, dates from Bandai. Read how prices work.` (the last words link to `/about-prices`). Then `Just show me the sets`, a 44px link to `/`. The TopBar and TabBar light nothing on `/start`. A single quiet **Start here ›** row closes Sets home in the tiles view, under the starter decks, for whoever skipped it.

## Research → response
Ten reviewers read v1 in the previous session (a lore encyclopedist as the domain expert, a Tokyo JP/EN collector as the non-English-market seat, and eight collector, player and design profiles). That session's branch was lost with its per-reviewer counts; what follows is what the ten heard as Jib recorded it, and what this v2 does about each point. Every factual claim below was re-verified against Bandai's EN pages and card lists on 6 Sep 2026 before it was acted on.

| Heard | Response |
|---|---|
| Lore expert: black cards debuted in ST-06, not OP-02 | Bandai's OP-02 page says so in as many words; the line now credits the Absolute Justice starter deck |
| Lore expert: OP-15's "Lucy" is Sabo | The line reads `Sabo as Lucy`; the leader list still names every OP-15 leader |
| Lore expert: leaders missing in OP-07 (Vegapunk), OP-10 (Smoker, Caesar Clown), OP-11 (Monkey.D.Luffy), OP-17 (Rocks.D.Xebec) | Rule: name all of a set's leaders or none, read from Bandai's EN card list per set; `seed:check` fails a line that names some but not all (a negative test caught `Shanks and Buggy lead` on OP-09) |
| Lore expert: the OP-09 and OP-16 lines talk about anniversaries and rarities | Both rewritten; rarity, alt-art, campaign and anniversary words fail the check on every line |
| Lines read like Bandai's marketing copy | Written from the page, never quoted: ≤22 words, present tense, one sentence, a finite verb before any semicolon, no noun-and-colon opening, no superlatives, no exclamation marks; all enforced |
| The story should feel like the set's own words, not a labelled field | Story under the set's name in ink, no `About this set` eyebrow; on the set page only |
| Tokyo collector: Japan releases first, so JP before EN; the JP name matters | Dates read JP then EN on the set page and on every timeline row; the JP name is the row's third line |
| `121 card types` was jargon; how many cards are there really? | `121 cards · 154 prints with alternate arts`: Bandai's figure as printed against the prints we hold |
| Whose date is `20 Nov`? | Caption on the timeline names both sources; a TCGplayer date reads `EN 20 Nov 2026 · US date` |
| A timeline as a remembered preference would hide the tiles from newcomers | A URL view behind two text tabs; nothing remembered, `/` is one screen for everyone |
| The gap between JP and EN is the interesting number | Third clause on every row: `4 months later`, `13 days later`, `15 days earlier`, `same day` |
| Where am I in the list? | Year rules as headings, year jump chips, a hairline Today rule between released and upcoming |
| Personal progress on the timeline, but quietly | `12 of 154` muted at the right edge, only where the set has been started |
| Prices and stories would turn the timeline into a second Sets home | Neither is on it; starter decks are not on it |
| A first-run screen must never trap a deep link or come back uninvited | Redirect only from `/` itself with an empty collection; flag set only by a door or Skip; session marker against repeats |
| Three doors, one sentence each, pillar words as eyebrows, no accent | Built as specified; Belong opens the timeline |
| Newcomers need the rules and a reason to trust the numbers | `New to the game? Play has the rules in five sentences.` and the trust line naming TCGplayer, Limitless and Bandai, linking to How prices work |
| A way back to Start here after skipping it | `Start here ›` row at the foot of Sets home |
| Nothing in the chrome should light up on a first-run screen | TopBar and TabBar light nothing on `/start` |

## Decisions (approved 6 Sep 2026)
1. **Stories are authored copy, one per booster set, recorded with `introSource`**, written from Bandai's EN page and checked mechanically (`seed:check`): ≤22 words, one present-tense sentence, no rarity / alt-art / campaign / anniversary words, no superlatives, all leaders or none. The refresh never writes one; a ready set without a line is a warning until someone writes it.
2. **Where Bandai has no EN product page, the line cites Bandai's EN card list**: EB-04, and OP-17, whose EN page is a title-only stub. OP-18 gets no line. EB-05 gets a row and a line from its EN page (no EN day, since Bandai gives a month).
3. **The story block (story, dates JP then EN, `121 cards · 154 prints with alternate arts`) sits under the set's name, before the box card.** This moves the box card down two lines from 3.2's "top of set detail"; the set reads set → box → cards.
4. **The timeline is a URL view of Sets home** (`/?view=timeline`) behind two text tabs, **Tiles** and **Timeline**, with no remembered preference.
5. **Row dates qualify the EN date**: `4 months later` / `13 days later` / `15 days earlier` / `same day`; a TCGplayer date reads `· US date` for as long as it is TCGplayer's, not only while the set is ahead.
6. **Start here shows once, from `/` alone**, on an empty collection; the flag is set by a door or Skip, a session marker prevents a repeat in the same visit, deep links never redirect. The three doors carry no accent; the "rules" sentence links to `/learn`, the trust line to `/about-prices`.
7. **No reviewer round was re-run**: everything above follows the recorded decisions; the calls that were mine (3, the gap wording in 5, the tab labels, the 640px cap on the list, the caption in ink) are implementation choices inside them.

## Not taken, noted for later
- Stories on tiles or timeline rows: decided against; the set page is where the story lives.
- A "From Bandai's page" link under the story: `introSource` is recorded in the data like `usSource`, not rendered; provenance in words lives on How prices work.
- A JP layer (JP dates and names on tiles and deck rows, a JP-first ordering of the timeline): the timeline's JP name and JP-first dates are the first piece; the rest waits.
- Starter decks on the timeline: out by decision; they have their own group on Sets home.
- An OP-18 line, and EB-05's JP name and dates: the day Bandai publishes the pages.
- The later items still open from Phase 7a research: a Keyword opener chip, the cheapest playable print in a watched character's row, pre-order price history on a pending set's page, a star for artists, sealed ownership in Portfolio, share-by-URL for decks.

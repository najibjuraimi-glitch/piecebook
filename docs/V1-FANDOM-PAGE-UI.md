# Piecebook V1 — Fandom page
(Design addendum, draft 11, 6 Sep 2026. Not approved. Not for merge.)

Owner: Code as interim Cards, drafted from Jib’s instruction to put a fandom page like [One Piece Wiki](https://onepiece.fandom.com/wiki/One_Piece_Wiki) on Piecebook, and from rendered mockups on `cursor/fandom-page-draft-f694`  
For: Design (critique), ten reviewers, then Jib  
Covers growth-map **11.1** (fandom home): `/belong`, a fifth tab, chapter/anime summaries, a wiki portal, a fruit Pokédex, a second character book, a reader cutoff  
Reads with: `V1-DESIGN-PACK.md`, `V1-FANDOM-UI.md` (7.7–7.11), `V1-BELONG-UI.md` (7.2 timeline, 8.1 Start here), `V1-FIND-UI.md` (7.4 character pages), `seed-sources.md`

This is the page Jib asked for after the Belong-directory draft was the wrong shape. It is a One Piece fandom home in the wiki’s rooms (story, people, fruits, media), quiet paper and ink, with doors into collect and play. It is not a quieter Fandom skin, and it is not a table of contents for set stories.

## Why this page
The three pillars are up. Fandom is the weakest. Jib’s journey is manga → anime → collect → play. He wants a dedicated fandom page that sends people into collect and play, and he named the rooms this draft had been refusing: chapter or anime summaries, a wiki portal, a fruit Pokédex, a second character book, a reader cutoff, a fifth tab, live `/belong` on main.

Live `/belong` on main is the end state. This branch is the draft. Nothing merges until Jib says approved and then “merge N”.

## What we will not do
- Clone the wiki’s ads, art, polls, or “On This Day” chrome. On This Day already lives under the timeline Today rule (7.9) and is reused here as the same component.
- Invent plot. Official Viz / Toei / Crunchyroll synopses are not licensed and are not stored. Wiki chapter pages are titles (`Chapter 1 is titled "Romance Dawn —The Dawn of the Adventure—"`), not plots.
- Pull wiki images. Render wiki article links. The licence URL is the only outbound wiki door, as in 7.8.
- Write a fifth encyclopedia of authored chapter blurbs.
- Skip the reader cutoff. A first visit does not unlock later paragraphs.

## 11.1 The page

**Route.** `/belong`. Sub-routes `/belong/story`, `/belong/people`, `/belong/fruits`. The mock is the page: there is no `/belong-preview`.

**Fifth tab.** TabBar and TopBar gain **Belong** after Portfolio. Active on `/belong` and its rooms. Phone 390 has five labels; they stay one line (`Collection` is the longest). The icon is an open book. `/start` still lights nothing. Character and artist pages stay in the Sets tree (the print book).

**Start here.** The Belong door goes to `/belong`, not `/?view=timeline`. Copy: *The story, the people, the fruits, and the game — as far as you have read.*

**Portal.** Title `Belong`. Subline `The story, the people, the fruits, and the game.` Then the cutoff chips. Then four doors in the Start-here card shape, no accent:

| Door | Goes | Question |
|---|---|---|
| Story | `/belong/story` | Every main arc, its chapters and episodes, and the wiki’s paragraph once you have finished it. |
| People | `/belong/people` | A second book: every printed Character and Leader, A–Z, into the prints you already have. |
| Fruits | `/belong/fruits` | A Pokédex of Devil Fruits the wiki records on a name we have asked. |
| The game | `/?view=timeline` | Sets in English order, who drew each card, what is coming next. |

Under them: On This Day when the device date has a birthday (same rows as the timeline, under a muted **On This Day** heading so the date is not a floating line). Then a Story strip — the last finished arc’s paragraph when a saga chip is on (Now still uses the last closed arc, Egghead, not the open Elbaph paragraph), otherwise the honest gap. Then People and Fruits in one short block with counts. Then **The game** as three rows (What you own → `/`, Sets in order → timeline, Play → `/decks`). Then `Play has the rules in five sentences.` Attribution only when a wiki paragraph printed.

## Reader cutoff
**Storage.** `piecebook.readerCutoff.v1`, the chip id. Default `debut`.

**Chips**, wrapping, 44px targets, ink-filled when on:

Debut arc · East Blue · Arabasta · Enies Lobby · Marineford · Dressrosa · Wano · Now

The numbered chips are the last chapter of that arc on the wiki Story Arcs list (95, 217, 430, 580, 801, 1057). **Now** is Elbaph open and late clauses (deaths, “former”) pass.

**What each chip unlocks.**

| Chip | Who-is on a name you open | Story paragraph | Fruits | People |
|---|---|---|---|---|
| Debut arc (default) | Stored debut-arc line (7.8) | Hidden | Hidden | Every printed name |
| A saga chip | Clauses recomputed at that chapter | Arcs whose last chapter is ≤ the chip | Fruits whose earliest eater debuts ≤ the chip | Names whose stored debut is ≤ the chip; a name with no debut on file stays |
| Now | Clauses at every chapter, late ones included | Every arc, including Elbaph | Every stored fruit | Every printed name |

Uncited clauses still fail. Straw Hats still have no sentence. Imu still shows nothing on the character page (later-name reveal). A fruit later-name after a line break (Nika on Luffy) is not stored.

Copy under the chips: *Summaries and fruits stay behind the last arc you have finished. A name you have not met yet is hidden. Who they are on a page you open follows the same chapter.*

## Chapter or anime summaries
**Source.** One fetch: the wiki [Story Arcs](https://onepiece.fandom.com/wiki/Story_Arcs) page (`npm run wiki:belong` → `data/wiki/summaries.json`). The paragraph under each `====[[Name]]====` heading, cleaned, never paraphrased. The same page’s `Chapters (a-b)` and `Episodes (c-d)` bullets. 33 main arcs, 6 Sep 2026, revid 2128192. Elbaph is open (`1126–`, `1156–`).

**Not taken, named.** Per-chapter plot (the wiki’s chapter lead is a title). Official episode synopses. Filler-only arcs. Wiki images in the Summary section.

**Story page.** Manga order. Heading is the name without the trailing “Arc”. Meta `Chapters 1–7 · Episodes 1–4`. The paragraph, or *Finish this arc to read the summary.* / *Pick how far you have read to unlock the summary.* Licence line when any paragraph printed.

## Wiki portal
The four doors on `/belong` are the portal. They are Piecebook rooms, not links to fandom.com. The wiki article is never a link.

## Fruit Pokédex
**Source.** Char Box `dfename` / `dfname` / `dftype` on each mapped printed name (`data/wiki/lines.json`, 188 names). First displayed line only; text after `<br>` or in `<small>` is a later name and is dropped. Localizer credits (`Viz`, `4Kids`, `Funimation`) are stripped. `Imu` / `The Devil's Fruit` is not stored. 6 Sep 2026: **92 fruits** on 99 eaters.

**Fruits page.** Closed until a saga chip is on. Then A–Z chips, English name, Japanese name and type muted, eaters as links to `/characters/:name` (eaters still behind the same chapter). Caption names the gap: the rest of the roster has not been fetched.

Luffy’s row is `Gum-Gum Fruit · Gomu Gomu no Mi · Paramecia`. Not Nika.

## Second character book
**People page.** Every EN print whose attributes say Character or Leader, A–Z, search, letter chips. A row is the printed name and `N prints · M sets`. Tap → the existing `/characters/:name` print page (7.4 / 7.8). That page stays the first book. This list is the second.

Attributes load on first visit, as Decks does. A name with no category on file is left out rather than guessed.

## Surfaces
`/belong` and its three rooms. The fifth tab. Start here. Who-is and its attribution recompute from stored clauses when a saga chip is on. The timeline, set stories, and character print grids do not move.

Device date is still the only date for On This Day.

## Data
- `scripts/wiki-belong-refresh.mjs` (`npm run wiki:belong`): Story Arcs once, then two parse calls per mapped name for the Char Box, 120 ms, same User-Agent. Writes `data/wiki/summaries.json` and `data/wiki/fruits.json` under CC BY-SA 3.0.
- `seed:check` fails a missing licence, a summary under six words, a localizer credit in a fruit name, or Imu as an eater.

## Decisions (draft — for reviewers, then Jib)
1. `/belong` is the fandom home; the mock is the live route; fifth tab **Belong**.
2. Start here Belong opens `/belong`.
3. Summaries are the wiki Story Arcs paragraph plus chapter and episode ranges, gated by a finished-arc cutoff. No authored blurbs. No official synopses. No chapter-page titles passed off as plot.
4. The fruit dex is Char Box fields on asked names, first line only, no later-name, no Imu. Not a clone of every fruit on the wiki.
5. The people book is printed Character / Leader names into the pages we already have.
6. Default cutoff is Debut arc: who-is unchanged, summaries and fruits closed.
7. No wiki images. No wiki article links. Licence URL only.
8. Live on `main` waits on “approved” and “merge N”.

## Not taken, noted for later
- Fetching every remaining printed name so the fruit dex and who-is cover the whole roster.
- Per-chapter or per-episode plot (no licensed, automatable source that is actually a plot).
- A live link to the wiki article.
- Lighting Belong on `/characters/:name` (those pages stay the Sets print book).
- Egghead as its own cutoff chip (Wano is 1057; Egghead is 1125; Now covers both).
- Authored Straw Hat lines.

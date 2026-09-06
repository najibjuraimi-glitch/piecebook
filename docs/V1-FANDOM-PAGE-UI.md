# Piecebook V1 — Fandom page
(Design addendum, draft 11 v2 after ten reviewers, 6 Sep 2026. Not approved. Not for merge.)

Owner: Code as interim Cards, drafted from Jib’s instruction to put a fandom page like [One Piece Wiki](https://onepiece.fandom.com/wiki/One_Piece_Wiki) on Piecebook, and from rendered mockups on `cursor/fandom-page-draft-f694`  
For: Design (critique), ten reviewers, then Jib  
Covers growth-map **9.1** (fandom home): `/belong`, a fifth tab, a story index (titles and ranges, no plot), a wiki portal, a fruit log, a second character book, a reader cutoff  
Reads with: `V1-DESIGN-PACK.md`, `V1-FANDOM-UI.md` (7.7–7.11), `V1-BELONG-UI.md` (7.2 timeline, 8.1 Start here), `V1-FIND-UI.md` (7.4 character pages), `seed-sources.md`

This is the page Jib asked for after the Belong-directory draft was the wrong shape. It is a One Piece fandom home in the wiki’s rooms (story, people, fruits, media), quiet paper and ink, with doors into collect and play. It is not a quieter Fandom skin, and it is not a table of contents for set stories.

## Why this page
The three pillars are up. Fandom is the weakest. Jib’s journey is manga → anime → collect → play. He wants a dedicated fandom page that sends people into collect and play, and he named the rooms this draft had been refusing: chapter or anime summaries, a wiki portal, a stored log of fruits and people (he said “Pokédex” as the example of that job, not the word on the glass), a reader cutoff, a fifth tab, live `/belong` on main.

Live `/belong` on main is the end state. This branch is the draft. Nothing merges until Jib says approved and then “merge N”.

## What we will not do
- Clone the wiki’s ads, art, polls, or “On This Day” chrome. On This Day already lives under the timeline Today rule (7.9) and is reused here as the same component.
- Invent plot. Official Viz / Toei / Crunchyroll synopses are not licensed and are not stored. Wiki chapter pages are titles (`Chapter 1 is titled "Romance Dawn —The Dawn of the Adventure—"`), not plots.
- Pull wiki images. Render wiki article links. The licence URL is the only outbound wiki door, as in 7.8.
- Write a fifth encyclopedia of authored chapter blurbs.
- Skip the reader cutoff. A first visit does not unlock later fruits.

## 9.1 The page

**Route.** `/belong`. Sub-routes `/belong/story`, `/belong/people`, `/belong/fruits`. The mock is the page: there is no `/belong-preview`.

**Fifth tab.** TabBar and TopBar gain **World** after Portfolio. Active on `/belong` and its rooms. Phone 390 has five labels; they stay one line (`Collection` is the longest). The icon is an open book. `/start` still lights nothing. Character and artist pages stay in the Sets tree (the print book).

**Name on the glass (Jib, 6 Sep 2026).** The fifth tab, the portal title, Start here’s third door, and the room crumbs are **World**. Wiki, Fandom, Story, and Belong are not chrome. Story stays a room. Belong stays the pillar in the docs. The route stays `/belong`.

**Start here.** The World door goes to `/belong`, not `/?view=timeline`. Copy: *The story, the people, the fruits, and the game — as far as you have read.*

**Portal.** Title `World`. Subline `The story, the people, the fruits, and the game.` Then the cutoff chips. Then four doors in the Start-here card shape, no accent:

| Door | Goes | Question |
|---|---|---|
| Story | `/belong/story` | Every main arc, its chapters and episodes. Titles and ranges only — no plot. |
| People | `/belong/people` | A stored log of every printed Character and Leader, A–Z, into the prints you already have. |
| Fruits | `/belong/fruits` | A stored log of Devil Fruits on the printed names we have asked: English, Japanese, type, who ate it. |
| The game | `/?view=timeline` | Sets in English order, who drew each card, what is coming next. |

Under them: On This Day when the device date has a birthday (same rows as the timeline, under a muted **On This Day** heading so the date is not a floating line). Then a Story strip — the last finished arc’s title and chapter/episode range when a saga chip is on (Now still uses the last closed arc, Egghead, not open Elbaph), otherwise the honest index. Then People and Fruits in one short block with counts. Then **The game** as three rows (What you own → `/`, Sets in order → timeline, Play → `/decks`). Then `Play has the rules in five sentences.` Attribution for the wiki index and fruit log.

## Reader cutoff
**Storage.** `piecebook.readerCutoff.v1`, the chip id. Default `debut`.

**Chips**, wrapping, 44px targets, ink-filled when on:

Debut arc · East Blue · Arabasta · Enies Lobby · Marineford · Dressrosa · Wano · Now

The numbered chips are the last chapter of that arc on the wiki Story Arcs list (95, 217, 430, 580, 801, 1057). **Now** is Elbaph open and late clauses (deaths, “former”) pass.

**What each chip unlocks.**

| Chip | Who-is on a name you open | Story index | Fruits | People |
|---|---|---|---|---|
| Debut arc (default) | Stored debut-arc line (7.8) | All 33 titles and ranges | Hidden | Every printed name |
| A saga chip | Clauses recomputed at that chapter | All 33 titles and ranges; featured row is the last finished arc | Fruits whose earliest eater debuts ≤ the chip | Names whose stored debut is ≤ the chip; a name with no debut on file is hidden |
| Now | Clauses at every chapter, late ones included | All 33 titles and ranges; featured row is the last closed arc | Every stored fruit | Every printed name |

Uncited clauses still fail. Straw Hats still have no sentence. Imu still shows nothing on the character page (later-name reveal). A fruit later-name after a line break (Nika on Luffy) is not stored.

Copy under the chips, **on `/belong` only**: *Fruits stay behind the last arc you have finished. On a saga chip, a name we cannot place before that chapter is hidden. Who they are on a page you open follows the same chapter. The story list is titles and ranges only.* Story, People and Fruits keep the chips and drop the explanation.

## Story index (Jib, 6 Sep 2026: option 1)
**Source.** One fetch: the wiki [Story Arcs](https://onepiece.fandom.com/wiki/Story_Arcs) page (`npm run wiki:belong` → `data/wiki/summaries.json`). Titles plus that page’s `Chapters (a-b)` and `Episodes (c-d)` bullets. **No plot paragraph is stored or shown.** 33 main arcs, 6 Sep 2026, revid 2128192. Elbaph is open (`1126–`, `1156–`).

**Not taken, named.** Wiki Story Arcs paragraphs (the unofficial recap). Authored blurbs. Official episode synopses. Per-chapter plot. Filler-only arcs. Wiki images.

**Story page.** Manga order. Heading is the name without the trailing “Arc”. Meta `Chapters 1–7 · Episodes 1–4`. Always open. Licence line for the wiki index.

## Wiki portal
The four doors on `/belong` are the portal. They are Piecebook rooms, not links to fandom.com. The wiki article is never a link.

## Fruit log
**Source.** Char Box `dfename` / `dfname` / `dftype` on each mapped printed name (`data/wiki/lines.json`, 188 names). First displayed line only; text after `<br>` or in `<small>` is a later name and is dropped. Localizer credits (`Viz`, `4Kids`, `Funimation`) are stripped. `Imu` / `The Devil's Fruit` is not stored. 6 Sep 2026: **92 fruits** on 99 eaters.

**Fruits page.** Closed until a saga chip is on. Then A–Z chips, English name, Japanese name and type muted, eaters as links to `/characters/:name` (eaters still behind the same chapter). Caption names the gap: the rest of the roster has not been fetched.

Luffy’s row is `Gum-Gum Fruit · Gomu Gomu no Mi · Paramecia`. Not Nika.

## Second character book
**People page.** Every EN print whose attributes say Character or Leader, A–Z, search, letter chips. On a saga chip, only names with a stored debut chapter at or before that chip — a name we have not placed is hidden (v2; v1 leaked Absalom and Ace at East Blue because 540 printed names have no wiki debut on file). Debut arc and Now still list every printed name. A row is the printed name, a stored log line (`Gum-Gum Fruit · ch 1` when the cutoff has opened fruits and we have a debut), and `N prints · M sets`. Fruit stays behind the same chip as the fruit log. Tap → the existing `/characters/:name` print page (7.4 / 7.8). That page stays the first book. This list is the stored log.

Attributes load on first visit, as Decks does. A name with no category on file is left out rather than guessed.

## Surfaces
`/belong` and its three rooms. The fifth tab. Start here. Who-is and its attribution recompute from stored clauses when a saga chip is on. The timeline, set stories, and character print grids do not move.

Device date is still the only date for On This Day.

## Data
- `scripts/wiki-belong-refresh.mjs` (`npm run wiki:belong`): Story Arcs once (titles and ranges only), then two parse calls per mapped name for the Char Box, 120 ms, same User-Agent. Writes `data/wiki/summaries.json` and `data/wiki/fruits.json` under CC BY-SA 3.0.
- `seed:check` fails a missing licence, a stored plot paragraph, a localizer credit in a fruit name, or Imu as an eater.

## Decisions (draft — for reviewers, then Jib)
1. `/belong` is the fandom home; the mock is the live route; fifth tab **World**.
2. Start here World opens `/belong`. Start here names that Piecebook is unofficial.
3. Story is an index: titles plus chapter and episode ranges. No wiki paragraphs. No authored blurbs. No official synopses. No chapter-page titles passed off as plot. Jib picked this 6 Sep 2026.
4. The fruit log is Char Box fields on asked names, first line only, no later-name, no Imu. Not a clone of every fruit on the wiki. Not the word Pokédex.
5. The people log is printed Character / Leader names with stored fruit and debut when we have them, into the print pages we already have.
6. Default cutoff is Debut arc: who-is unchanged, fruits closed, story index open. People is the full print book until a saga chip is on.
7. No wiki images. No wiki article links. Licence URL only. The licence line names the work and revid.
8. Live on `main` waits on “approved” and “merge N”.

## Research → response (ten reviewers: lore encyclopedist, Tokyo JP/EN collector, new fan mid-East-Blue, copy editor, product designer, phone reader, card collector, budget parent, low-vision collector, Singapore store owner)

| Heard (of ten) | Response |
|---|---|
| 7 — People at East Blue still lists later names (A.O., Absalom, Ace & Newgate). 540 printed names have no wiki debut on file; v1 left them in | On a saga chip, a name with no stored debut is hidden. Debut arc and Now still list every printed name |
| 5 — The three-line cutoff note repeats on Story, People and Fruits and reads as a terms wall | Explanation on `/belong` only. Rooms keep the chips |
| 4 — “Pokédex” is a Pokémon word / a tone break / something a shop has to explain | Cut. Jib used it as an example of a stored log of fruits and people, not as the word on the glass. Door copy is now that log. |
| 3 — Default Debut arc still shows every printed name, including people a new reader has not met | Kept. The second book is the print index until a saga chip is on. Copy now says the hide rule is on a saga chip |
| 3 — The game is a door and a section of three rows | Kept. The door is the portal; the rows send into collect and play |
| 3 — Who-is cutoff is invisible on the character page | Not taken. That page stays the Sets print book; the chip is remembered |
| 2 — Fifth tab crowds Collection on 390 | Measured: Collection 51px in a 78px slot, one line. Kept |
| 2 — On This Day can name someone you have not met | Already decided on 7.9; same component |
| 2 — “the names we have asked” is pipeline talk | Kept. It is the honest gap (92 of the roster) |
| Split — JP names on chips and people; ownership marks on people; confirm before Now; darker muted type | Noted for later |
| Not taken — authored Straw Hat lines; wiki article links; lighting Belong on `/characters/:name`; Egghead as its own chip | Same as draft 11 |

## Not taken, noted for later
- Fetching every remaining printed name so the fruit log and who-is cover the whole roster.
- Per-chapter or per-episode plot (no licensed, automatable source that is actually a plot).
- A live link to the wiki article.
- Lighting World on `/characters/:name` (those pages stay the Sets print book).
- Egghead as its own cutoff chip (Wano is 1057; Egghead is 1125; Now covers both).
- Authored Straw Hat lines.

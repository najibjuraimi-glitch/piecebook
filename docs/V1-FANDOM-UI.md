# Piecebook V1 — Fandom, distilled
(Design addendum, v2 after user research: ten simulated reviewers, 6 Sep 2026; approved by Jib 6 Sep 2026 SGT)

Owner: Code as interim Cards, drafted from rendered mockups and ten simulated user reviews; approved by Jib 6 Sep 2026 SGT  
For: Code (implement), Design (critique)  
Covers growth-map 7.7 (wiki line pipeline), 7.8 (Who is / Born), 7.9 (On This Day), 7.11 (countdown). 7.10 (Today's card) is specified and then stood down for the timeline.  
Reads with: `V1-DESIGN-PACK.md`, `V1-BELONG-UI.md` (7.2 timeline Today rule), `V1-FIND-UI.md` (7.4 character pages), `seed-sources.md`

The One Piece Wiki's main page is too wordy. Piecebook takes three automated things from it onto a surface a reader asked for, and refuses the rest. Nothing is typed by hand. Wiki images are never pulled. Wiki article links are never rendered.

## Why these together
A character page that only lists prints does not say who the person is. The wiki's first sentence, cut by rule and gated per clause, is the only version that is automatable, attributable and testable — and it belongs on the page the reader opened, not on Sets. The birthday beside it is a dated fact, not plot. Upcoming rows already have a day; a countdown is arithmetic, never stored. Authored leader lines are refused. A card of the day built from anyone with a passing line is refused on the timeline: the people a new reader knows fail the gate, so the date rule systematically features strangers and later-saga place names.

## 7.7 Wiki line pipeline
**Script** `npm run wiki:refresh` (`scripts/wiki-refresh.mjs`). Daily, per printed Character or Leader name: two parse calls (section 0 and `Template:<Title>_Tabs_Top`) 120 ms apart under `User-Agent: Piecebook/1.0 (+https://github.com/najibjuraimi-glitch/piecebook)`. Maps dotted initials, quoted epithets, honorifics and spelling-variant redirects. A redirect whose target adds a word the printed name does not carry is a later-name reveal and stores nothing to show (`Imu` → `Nerona Imu`, chapter 1187; same class as Komurasaki → Kouzuki Hiyori). Event and Stage cards and pairs are not asked.

**Gate.** Debut D from `first`. Cutoff C is the last chapter of the arc that holds D (33 main arcs; Elbaph open). Clause by clause on `chap=` / named Qrefs from section 0 + Tabs_Top; uncited fails; a past-tense verb or a time word is late and needs a cited death chapter (the wiki `status` never has `chap=`, so Roger has no line). Longest passing opening; ≤22 words; under six words or no finite verb, nothing; never paraphrase.

**Cache, 6 Sep 2026 (OP-01, OP-09, OP-17 and every leader).** 214 asked, 188 mapped, **40 lines** kept before the name-reveal rule, **169 births (89.9%)**. Straw Hats and Shanks fail the gate, which is intended. Birth parse clears the 80% bar for On This Day.

## 7.8 Who is … and Born
**Where.** Character page, under the name, before the prints line. Card pages stay as they are: 7.4's door leads here.

**What.** The gated line in ink, body size, one sentence, no eyebrow — only when the wiki title is not a later-name reveal. Then `Born 9 March` in ink when the Char Box parsed a day. Then the prints line. Then, only if a line was printed, in ink (not muted): `From One Piece Wiki, CC BY-SA 3.0.` The licence name links the licence. The wiki page is not a link. No attribution on a birthday-only page (Luffy, Shanks). Nothing at all when the gate stored neither, or when the title is a reveal (Imu).

## 7.9 On This Day
**Where.** Under the timeline's Today rule.

**What.** The short date (`9 Mar`) as its own line, then at most three names as **44px rows**, A–Z by the printed name, each a link to that character (`Dracule Mihawk's birthday`). The rule itself still says only `Today`. Nothing on a day without a birthday. A name-plus-birthday is an existence leak a new reader will take; it is not a plot sentence, and it stays.

## 7.10 Today's card — stood down on the timeline
The date rule (days-since-epoch modulo the sorted pool of base prints with a visible line) is specified. It does not ship on the timeline.

A pool with no reader floor lands Kin'emon (Wano, Kuri) and can land Imu (Empty Throne) on Sets, the tab nobody opted into as a story. Restricting the pool to debut chapter ≤ 95 (Arlong Park) leaves **four names** in the sample (Cabaji, Mihawk, Krieg, Limejuice), under the ≥100 bar. Until a full-roster fetch produces ≥100 East Blue–debut prints with a passing line — which it likely will not, because those names fail the gate — the timeline Today rule is birthdays and the countdown only.

If it ever ships, the row is art + name + number, no sentence, no attribution. The line lives on the character page.

## 7.11 Countdown
**Where.** Last clause on an upcoming timeline row, after the date. The same clause on a pending set page header.

**What.** From the device date at render, never stored. A row whose day is Bandai's may say `in 75 days` / `tomorrow` / `today`. A row whose day is TCGplayer's writes `US date 30 Oct 2026` (not `EN … · US date`) and may add `in 54 days` or `in 1 day`; it never says `today` or `tomorrow`. A set with no ISO day gets none.

## Surfaces
On the live character page (`/characters/:name`) and the live timeline (`/?view=timeline`). No `/fandom-preview` route. Wiki images are never pulled; wiki article links are never rendered.

Device date is the only date. Pinning a day was a draft-preview tool and is not on the live screens.

## Research → response (ten reviewers: lore encyclopedist, Tokyo JP/EN collector, new fan mid-East-Blue, copy editor, product designer, phone reader, card collector, budget parent, low-vision collector, Singapore store owner)

| Heard (of ten) | Response |
|---|---|
| 7 — Today's card under the birthday looks like it belongs to it, and the sentence is a later-saga leak (Kin'emon / Kid / Imu) on Sets | Stood down on the timeline. Character page keeps the line. East Blue–safe pool is 4 names, under 100 |
| 5 — Imu's line (and `Nerona Imu`) is the throne reveal; the wiki title link is a spoiler door | Name-completion redirects show nothing; no wiki page links anywhere; licence URL only |
| 5 — Attribution is a whisper, a terms trap, or a claim on a birthday-only page | Attribution only under a printed line, after the prints count, in ink: `From One Piece Wiki, CC BY-SA 3.0.` |
| 4 — Three birthday names as one wrapping sentence; links under 44px | Date on its own line; each name a 44px row |
| 3 — `EN … · US date · today/tomorrow` is a shop clock I do not keep (Tokyo / Singapore) | US-date rows read `US date 30 Oct 2026 · in N days`; never today or tomorrow |
| 2 — Luffy / Shanks with no sentence looks empty, or like we should write one | Kept. Birthday only. No authored substitute. Attribution dropped so the hole is not dressed as a missing paragraph |
| 1 — Oxford comma; Mar vs March; printed `Eustass"Captain"Kid` vs line `Eustass Kid` | Stacked rows drop the comma problem; Mar / March stay as date vs Born; printed name and gated subject stay as they are |
| Split — 72px art on a type-only timeline | Moot while Today's card is off the timeline |
| Not taken — authored Straw Hat lines; who-is on the card page; live wiki link; countdown to a month-only Bandai date | Noted for later; none contradicts the design |

## Decisions (approved 6 Sep 2026)
1. Cleaned wiki sentence for a name the reader opened, when the gate passes and the title is not a later-name reveal; authored substitutes refused.
2. Attribution only when a line is printed, after the prints count, licence link only, no wiki article link.
3. On This Day under the Today rule: date, then at most three 44px name rows, A–Z.
4. Today's card does not ship on the timeline. The date rule is specified; the safe pool is under 100.
5. Countdown is arithmetic on a sourced ISO day. `today` / `tomorrow` only when the day is Bandai's. A TCGplayer day is labelled `US date` and counts in days only.

## Not taken, noted for later
- Authored leader lines for names the gate fails (Shanks, Luffy, Roger).
- Today's card on the timeline, or a card of the day's birthday name.
- Reader-set "read up to chapter N" (clauses are already stored).
- Arc links from 7.1 stories, wiki images, Content grid, Current Events, editor plumbing.
- A live link to the wiki article (licence page only).
- Putting the who-is line on tiles, timeline rows or the card page.
- Counting down to a month-only Bandai date by inventing a day.

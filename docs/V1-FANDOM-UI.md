# Piecebook V1 — Fandom, distilled
(Design addendum, v1 draft: prototype on `cursor/fandom-draft-eb1f`; ten-reviewer round still to run)

Owner: Code as interim Cards, drafted from the PM memo of 6 Sep 2026 and a rendered prototype  
For: Code (implement), Design (critique)  
Covers proposed growth-map 7.7 (wiki line pipeline), 7.8 (Who is / Born), 7.9 (On This Day), 7.10 (Today's card), 7.11 (countdown)  
Reads with: `V1-DESIGN-PACK.md`, `V1-BELONG-UI.md` (7.2 timeline Today rule, 7.1 authored set stories), `V1-FIND-UI.md` (7.4 character pages), `seed-sources.md`

The One Piece Wiki's main page is too wordy. Piecebook takes four automated things from it and refuses the rest. Nothing is typed by hand. Wiki images are never pulled.

## Why these five together
A character page that only lists prints does not say who the person is. The wiki's first sentence, cut by rule and gated per clause, is the only version that is automatable, attributable and testable. The birthday beside it is a dated fact, not plot. Those two facts, plus a date rule, give the timeline's Today rule a card of the day without an editor. Upcoming rows already have a day; a countdown is arithmetic, never stored. Authored leader lines are refused: a third authored corpus breaks nothing-manual and cannot be gate-tested.

## 7.7 Wiki line pipeline
**Script** `npm run wiki:refresh` (`scripts/wiki-refresh.mjs`). Daily, per printed Character or Leader name: two parse calls (section 0 and `Template:<Title>_Tabs_Top`; wikitext, revid, categories) 120 ms apart under `User-Agent: Piecebook/1.0 (+https://github.com/najibjuraimi-glitch/piecebook)`. Maps dotted initials (`Monkey.D.Luffy` → `Monkey D. Luffy`), quoted epithets, honorifics and spelling-variant redirects. A redirect whose target is not a spelling variant of the printed name stores nothing (Komurasaki → Kouzuki Hiyori; Trafalgar Law → Trafalgar D. Water Law). Event and Stage cards are not asked. Pairs on one card are not asked.

**Gate.** Debut D from the first `[[Chapter N]]` in `first`. Cutoff C is the last chapter of the arc that holds D, from the wiki's Story Arcs page (33 main arcs, Elbaph open). Clause by clause on `chap=` / named Qref definitions from section 0 + Tabs_Top; uncited fails; a past-tense verb or a time word (`former`, `late`, `years ago`, …) is late and needs a cited death chapter (the wiki's `status` is a bare code and never has `chap=`, so Roger has no line). Keep the longest passing opening; cut trailing clauses to ≤22 words; under six words or no finite verb, nothing; never paraphrase. The printed name, epithet dropped, is the subject.

**Cache.** `data/wiki/lines.json` (bundled): name, wiki title, revid permalink, fetch date, debut, cutoff, arc, line, birth, clauses, a one-sentence rules statement, CC BY-SA 3.0 notice. `data/wiki/audit.json` (not bundled): raw sentence, every clause with its verdict, unmapped names. `data/wiki/arcs.json`: the 33 arcs. The refresh never writes prose of its own. `seed:check` will, on the build, warn after three silent days and fail a line over 22 words.

**First cache, 6 Sep 2026.** OP-01, OP-09, OP-17 and every leader: 214 names asked, 188 mapped, **40 lines kept (21%)**, 169 births parsed (89.9%). Straw Hats fail their first clause after the debut-arc cutoff (Nami/Zoro on c1058, Luffy on 455). Shanks's first clause is under six words. The 89.9% birth parse clears the 80% bar for On This Day. The sample's passing-line base-print pool is reported on the draft index; the feature ships only at ≥100.

## 7.8 Who is … and Born
**Where.** Character page, under the name, before the prints line. Card pages stay as they are: 7.4's door leads here.

**What.** The gated line in ink, body size, one sentence ending in a full stop, no eyebrow. Then `Born 9 March` in ink when the Char Box parsed a day (day then the full month, no year). Then, muted: `Text adapted from 'Dracule Mihawk', One Piece Wiki, CC BY-SA 3.0.` — the title links the revid permalink, the licence name links the licence. Attribution sits under every line or birthday; nothing when the gate stored neither. The wiki title is the attribution's page name; Bandai's printed form stays the name everywhere.

**Nothing when the gate fails.** Luffy, Zoro, Nami, Shanks, Roger: birthday only, or nothing. No placeholder, no authored substitute.

## 7.9 On This Day
**Where.** Under the timeline's Today rule.

**What.** `9 Mar · Dracule Mihawk's birthday, Franky's birthday and Shanks's birthday` — short month as every other Piecebook date, at most three names A–Z by the printed name, each a link to that character. The rule itself still says only `Today`. Nothing on a day without a birthday. Ships because birth parsed on 89.9% of the mapped names.

## 7.10 Today's card
**Where.** Under the same Today rule, beneath On This Day when both exist.

**What.** One base print a day: days-since-epoch (UTC) modulo the sorted pool of base prints whose printed name has a passing line. The same card for everyone on a given day. Bandai's render (Limitless, as every other card), the name and number, the gated line, the attribution. The art and line link to the card; the attribution links the wiki. No eyebrow (`Today's card` is not said). Built only if the pool is ≥100 once the full roster is fetched; the draft shows it from the sample pool so the surface can be judged.

## 7.11 Countdown
**Where.** Last clause on an upcoming timeline row, after the EN date. After 7b merges, the same clause on a pending set page header.

**What.** `in 75 days` / `tomorrow` / `today`, from the device date at render, never stored. Needs a calendar day. A row whose EN date is TCGplayer's still counts (the day is TCGCSV's, already shown as `US date`). A set with no ISO day (Bandai gave only a month, and TCGCSV has not given a day) gets none.

## Surfaces (draft)
Prototyped on `/fandom-preview` only. Character mocks at `/fandom-preview/character/:name`. Timeline mock at `/fandom-preview/timeline?date=YYYY-MM-DD`. Live `Character.tsx`, `Sets.tsx`, `SetDetail.tsx` and `data/set-intros.json` are not edited until 7b merges and this draft is approved.

Pin `?date=2026-03-09` for the three 9 March birthdays (Dracule Mihawk, Franky, Shanks). Pin `?date=2026-10-29` / `2026-10-30` for `tomorrow` / `today` on EB-05.

## Not taken, noted for later
- Authored leader lines for names the gate fails (Shanks, Luffy, Roger).
- Arc links from 7.1 stories.
- Reader-set "read up to chapter N" (clauses are already stored so this can recompute the line).
- Wiki images, Content grid, Current Events, Upcoming Releases table, editor plumbing.
- Putting the story or the who-is line on tiles, timeline rows or the card page.
- Counting down to a month-only Bandai date by inventing a day.

## Decisions (draft — not approved)
1. Cleaned wiki sentence for everyone who passes the gate; authored substitutes refused.
2. Attribution on every line and every birthday: revid permalink + CC BY-SA 3.0.
3. On This Day under the Today rule, at most three names, A–Z, nothing invented.
4. Today's card is a date rule over the passing-line pool, same for everyone; ships at pool ≥100.
5. Countdown is arithmetic on a sourced ISO day, including TCGCSV's US date; never stored.
6. Prototype stays off the live screens until 7b is merged and this addendum is approved.

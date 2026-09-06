# Piecebook — Fandom pillar reevaluation
(Map note, 6 Sep 2026. Not a design addendum. Not approved. Not a build.)

Owner: Code as interim Cards  
For: Jib (decide), Design (critique)  
Prompted by: Jib, after PR #26, with One Piece Wiki home screenshots  
Reads with: `OBJECTIVE.md`, `V1-FANDOM-UI.md`, `V1-BELONG-UI.md`, `V1-FIND-UI.md`

Jib is right that Fandom is the thin pillar. The proposed cure — a story-arc map, chapter and anime summaries, a fruit Pokédex, a character Pokédex — is mostly a quieter wiki. That contradicts the pillar we already approved. Research first. Do not take Jib's journey as the user's journey.

## What is actually weak
Fandom is not missing an encyclopedia. It is missing a door a manga-first person recognizes, and the pages we do have are thin by rule.

Shipped, and working: set stories (7.1), the EN/JP timeline (7.2), artists (7.3), character pages of prints (7.4), upcoming sets (7.5), a gated wiki sentence and birthday (7.8), On This Day (7.9), countdown (7.11). Start here's Belong door goes to the *release* timeline.

Thin by design: the wiki cache is OP-01, OP-09, OP-17 and every leader (214 asked, 40 lines). Straw Hats and Shanks have no sentence — the gate is doing its job. Today's card was stood down because an East Blue–safe pool is four names (7.10). Clauses for a later reader cutoff are already stored and unused.

7.6 official events is still low. That is the one open Belong task that points at *play* (a local, a regional), and it has no automated Bandai feed.

## Challenge: the journey is one journey
Jib: manga → anime → collect → play. That may be common. It is not law.

Other journeys already sat in research: a new fan mid–East Blue (why we gate), a play-first local, a chase collector who never watches, an anime-only reader who never opens a volume. "Fandom should magnet toward play, then collect" inverts Jib's own order (he collected before he played) and is a product claim, not a finding.

Piecebook's objective is to become collector *and* player *and* fan. Belong that does not touch a card is the wiki. Belong that only lists sets by EN date is a collector calendar. The magnet that fits all three pillars: you meet a name or a fruit *on a print* → you know who they are at the chapter you have reached → you can star them, find their other prints, or put them in a deck.

Seat four journeys in the next research round before any new Fandom row besides 11.0 opens: manga-first, anime-first, play-first, collect-first. Ten reviewers; one of them a lore encyclopedist (already useful) and one a person who has never read past Arlong Park (already useful).

## Challenge: the wiki home is the thing we refused
The screenshots are Explore / World / Media, volume tiles, saga lists, Characters, Live-action, On This Day, ads, art. `V1-FANDOM-UI.md` already said the wiki main page is too wordy and Piecebook takes three automated things onto a surface the reader asked for. Copying that portal — even in paper and ink — makes Piecebook a Fandom skin. Then there is no reason to open us instead of them.

We already have On This Day. We already have Characters (card-first). We do not take wiki images or wiki article links.

## What to refuse (unless a licensed, dated, automated source appears)
- **Chapter and volume summaries.** A thousand-plus chapters. Our words are authored and manual. Wiki plot is a spoiler engine and a mirror. Bandai does not publish chapter blurbs. Same class as invented prices.
- **Anime arc summaries.** Same. Streamer synopses are licensed. Wiki plot is the Today's-card leak at saga scale.
- **A second character Pokédex.** `/characters/:name` is that index. A grid of faces with no prints is the wiki Characters tile.
- **"Where One Piece is at now" as a plot page on Sets.** "Now" for a new viewer is Elbaph / the Final Saga. We already refused later-saga names on the home tab.

## What we already hold, unused
- `data/wiki/arcs.json` — 33 arcs, first and last chapter, Elbaph open. Names and numbers. Not plot.
- Every cached entry's `clauses[]`, `debutChapter`, `cutoffChapter`, `arc`. A reader cutoff can recompute the line without a new fetch.
- Set stories already name the *game's* place in the manga (Marineford, Four Emperors, Egghead) from Bandai's EN page, 22 words, sourced.

## Candidate work — only if research asks (do not open in ClickUp yet)

| If they ask | Piecebook shape | Not |
|---|---|---|
| I don't know who this person is | 11.1 Reader cutoff: "I've read up to {arc}". Recompute the stored clauses. Default stays debut-arc. | Authored Straw Hat lines |
| The character book feels empty | 11.2 Full-roster `wiki:refresh --all` (enabler). Same gate. Still no images. | Filling holes with our prose |
| Where is this *set* in the story? | 11.3 Story-order of **sets**, not chapters. OP-01 Romance Dawn → … → OP-17. Each row is a set we already hold, with its 7.1 line. | A manga chapter list |
| What does this fruit do? | 11.4 Fruits that appear on an EN print (name, trait, or card). Gated wiki line, users as character links, the prints. | Every fruit in the manga |
| Where is the manga right now? | 11.5 One dated fact behind a tap: current arc name and last numbered chapter from the wiki arc list. Not on Sets. Not a summary. | "Sail into the world" |

7.6 stays low until Bandai has an automated events source. A fruit book will not pull someone to a local. An official event link might.

## Decisions (draft — waiting)

1. Fandom is the thin pillar. The next research round seats journeys. Do not take Jib's path as given.
2. No chapter, volume, or anime-arc summaries. No wiki portal.
3. Character Pokédex is the character page we have. Strengthen it; do not clone it.
4. Any new Fandom surface is card-first or set-first, gated, attributable, automated. A gap is named, not filled.
5. Map row 11.0 is this decision. No ClickUp tasks for 11.1–11.5 until research asks.

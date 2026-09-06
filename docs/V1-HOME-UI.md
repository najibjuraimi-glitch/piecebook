# Piecebook V1 — Home is Start
(Design addendum, draft 6 Sep 2026. Not approved. Not for merge.)

Owner: Code as interim Cards, from Jib’s note that live `/` is Sets and `/start` is a side door  
For: Jib  
Reads with: `V1-CUSTOMER-LENSES-UI.md` (the Start glass), `V1-BELONG-UI.md` (8.1 one-shot), `V1-DESIGN-PACK.md`

Not a shop. No cart. No new phase.

## Why this does not make sense
Collectr’s URL is a card shop. Bandai Asia’s URL is the card game. Piecebook’s URL after PR #30 is still the Sets grid (Romance Dawn at US $1,468.78 first). The page we built so a new tab knows the place lives at `/start` and is shown **once**, only if nothing is owned and `piecebook.started.v1` is empty. A second visit, a Sets tap, or any owned card skips it. Jib opened `/` and saw Sets. That is the bug.

8.1 treated Start as an onboarding interstitial because OBJECTIVE said “Sets stays home” when the app was collector-only. The app is now three jobs. A one-shot cannot be the homepage.

## What a first tab needs
The site URL must be the place-page every time: *One Piece cards. Prices, the game, and the story.* Then Find / Learn / Story. Sets is a room, one tap away.

## On the glass
| URL | Screen |
|---|---|
| `/` | Start (every visit). Wordmark is home. Nothing lit in the tab bar. |
| `/sets` | The Sets tiles / timeline / search that used to live at `/` |
| `/sets/:setCode` | Unchanged |
| `/start` | Redirects to `/` |
| `/?q=` or `/?view=` | Redirects to `/sets` with the same query (old links) |

Sets tab and every “Sets” crumb go to `/sets`. Find door, Start search, and “Just show me the sets” go to `/sets`. Timeline links go to `/sets?view=timeline`. The one-shot redirect and the “Start here ›” trap are gone.

## Not taken
A sixth Home tab. Cart. Changing the Sets grid itself.

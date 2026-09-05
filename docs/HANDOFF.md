# Piecebook — how this project is run (handoff for a fresh session)
As of: 5 Sep 2026 SGT. Owner: Jib. Read `docs/OBJECTIVE.md` first (objective, pillar matrix, decisions taken), then `docs/growth-map.csv` (every task with dependencies; ClickUp mirrors it).

## The loop, per phase (Jib's rule: design first, then build)
1. **Draft** a design addendum in `docs/V1-*.md` (same front matter as the others) and render mockups from the real components at phone 390 and wide 1280. Post the note in chat with the mockups in the run's artifact folder (`/opt/cursor/artifacts/draft_phase<N>_*.png`) and a numbered list of decisions.
2. **Research**: ten simulated users as parallel subagents, each a distinct profile, each returning first impression · top 5 frictions with severity · 3 things that work · one trade. Always seat a domain expert (a rules judge caught three rules errors and a wrong link target in Phase 6b) and one non-English-market user. Ten is the number; fifteen only repeated. Synthesize by count-of-ten; check any factual claim a reviewer makes before acting on it.
3. **Revise** the draft (prototype + spec with a "Research → response" table). Keep agent jobs small and bounded — code, then renders, then spec — each committing or writing a file; never one open-ended agent for all three (that stalled once for 40 minutes). The maintainer does the visual QA.
4. **Approval** from Jib in chat ("approved"), then **build**: a fresh branch off `main` (or stacked on the unmerged branch it depends on), one commit per growth-map task, the addendum marked approved, README updated, a draft PR with screenshots committed under `docs/review/pr<N>/` and embedded inline, a "Review locally" line, direct links to the screenshots in the chat message. Never merge; Jib says "merge N" and the maintainer merges with `git merge --no-ff` and pushes `main`.
5. **ClickUp** is updated by Jib via a cloud-agent prompt (REST API, `CLICKUP_API_TOKEN`, not the MCP connector; secrets are not injected into cloud VMs for this public repo). Provide the prompt: statuses, comments with PR links, dependency changes; known ids are in `docs/growth-map.csv` history and past prompts.

## Non-negotiables
- Quiet paper, ink, one accent only on the primary action, no marketplace chrome, no percent badges, copy in plain words, no invented data: if a source does not publish it, say so rather than guess.
- **Nothing manual.** Data comes from automated sources or not at all: Limitless (cards, attributes, prices), TCGCSV (`tcgcsv.com`, a once-a-day mirror of TCGplayer's API: boxes, starter decks, prices, renders; identify with `User-Agent: Piecebook/1.0`, one pull a day, 120 ms between requests). TCGplayer's own site is never read by the workflow. Hand-read figures (the SG asks) were retired.
- `npm run build` and `npm run seed:check` must pass; CI runs both on every PR.
- Branch names `cursor/<topic>-eb1f`, lowercase. Do not force-push or amend. Screenshots: phone 390 (deviceScaleFactor 2) and wide 1280, headless Chrome via playwright-core at `/usr/local/bin/google-chrome`, against `npx vite preview`.

## Where things are (5 Sep 2026)
- Live: https://najibjuraimi-glitch.github.io/piecebook/ — every merge to `main` republishes via `.github/workflows/pages.yml`. Daily data: `.github/workflows/seed-refresh.yml` at 02:10 UTC opens a PR on `automation/seed-refresh`; Jib merges it (0.4).
- Shipped: Phases 0–4 and 3 complete; Phase 5 decided (5.1 closed, 5.4 re-opened as an automated dated S$ rate, 5.2/5.3 parked). Phase 6: 6.1–6.4 in PR #19, 6.5–6.7 in the PR stacked on it; data for starter decks on `cursor/starter-decks-data-eb1f` (merged into that PR).
- Next by the map: 5.4 currency (design draft first), Phase 7 Belong (7.5 upcoming sets is automatable from TCGCSV groups: EB-05 30 Oct 2026, OP-18 20 Nov 2026; 7.3 artists from attributes; 7.4 characters from `/characters`), Phase 8 Start here.
- Later items with user demand from research: sealed ownership in Portfolio; a JP layer (titles, dates); share-by-URL for decks; colour words for decks named without one; Bandai card Q&A link.

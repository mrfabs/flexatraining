# Open Threads

Active work in this project. Read at the start of every session and surface any open threads to the user. Update before every `/exit`.

---

## Connect Vercel to GitHub

**Status:** Done  
**What was done:** GitHub repo at github.com/mrfabs/flexa connected to Vercel. Root directory set to `prototype/`. All env vars from `.env.example` added. `ANTHROPIC_API_KEY` intentionally excluded — Claude feedback is still stubbed.  
**What to do next:** Nothing. Revisit when ready to enable real Claude feedback.  
**Last updated:** 2026-04-24

---

## Prototype Gate

**Status:** Done  
**What was done:** Passcode gate added to `App.jsx`. Default passcode is `flexa` (set via `PASSCODE` constant at the top of the file). Gate checks localStorage key `prototype_access` — once entered correctly it persists. To reset: `localStorage.removeItem('prototype_access')` in the browser console.  
**What to do next:** Change the passcode before sharing the URL publicly.  
**Last updated:** 2026-04-23

---


## Stats + Dashboard Rework — Round 2

**Status:** In progress — user testing needed  
**What was done:**
- `Stats.jsx` fully rewritten: FTP, W/kg, and Weight merged into one combined card (three rows), each showing trend direction. FTP trend compares last 4 vs 4–8 weeks. W/kg trend derived from FTP delta. Weight trend tracked in localStorage (`weight_history`) and compared to 30 days prior — populates over time. Consistency signal card removed.
- Progress chart in Stats: fixed baseline handling — `startFtp` now uses the FTP entered at onboarding as the true origin point, not conflated with current detected FTP. Past progress renders correctly when a goal start date is set.
- Dashboard expanded activity view: replaced single text line with two rows of data tiles. Row 1 (always): NP, TSS, Cal. Cal falls back to `kilojoules` from Strava if `calories` is absent. Row 2 (if HR present): Avg HR, Avg Zone (Z1–Z5 derived from avg/peak HR ratio), Peak HR.
- Feeling selector added to expanded activities: tap one emoji (😴😐🙂💪🔥) → saves to localStorage as `feeling_ratings[activityId]` → disappears permanently. No editing after submit.
- Goal progress bar on Dashboard: removed status/pace rows below the track. Card now shows only title, date, percentage, and the progress bar with expected-pace tick.
- Suggested workout card (planned sessions): added "Objective" block with `objective` and `targetZone` fields — stubbed as "Claude will personalize this" until populated.
- Section `margin-top` reduced from 28px → 20px globally to reduce sparseness.
- `CLAUDE.md` updated with product flow responsibility rule: any screen change must consider whether onboarding collects the data that screen needs.
**What to do next:** User to test: (1) Stats metrics card with trend arrows, (2) expanded activity data tiles on Dashboard, (3) feeling selector submit-and-disappear, (4) progress chart with a goal that has a past start date set.  
**Last updated:** 2026-04-24

---

## Plan Generation and Onboarding Overhaul

**Status:** Shipped — needs user testing  
**What was done:**
- Onboarding flow reordered: coaching question is now step 1 (before goal-setting)
- AI coach path: user uploads existing plan as `.md` file, skips goal steps, goes through context questions (life context, structure, consistency), then non-negotiables and supporting activities before the done screen
- Self-coached path: goes through full goal-setting flow, then context questions, then non-negotiables/supporting/keeping activities, then Claude auto-generates an 8-week plan via API before the done screen
- Claude feedback un-stubbed: `generateFeedback` now calls the API. System prompt updated to focus on yesterday/today/tomorrow, sustainability, max 3 sentences. Dashboard passes a 3-day window instead of 14-day history
- "I have a coach" option marked as Coming Soon (disabled in picker)
- Hardcoded rule-based plan (`plan.js`) no longer generated for `ai` or `self` coaching paths — only the Claude-generated/uploaded plan is used
- AI coach prompt updated: now says "Turn my current training plan into this format" and instructs user to save as `.md`

**What to do next:** User test both flows end to end. Key things to verify: (1) Claude plan generation completes and populates the dashboard calendar, (2) dashboard feedback card shows real coaching text, (3) AI coach upload parses correctly and calendar populates, (4) Coming Soon badge on "I have a coach" renders correctly.  
**Last updated:** 2026-04-24

---

## Strategy — Core Positioning and Product Loop

**Status:** Done  
**What was done:** Added four new sections to `strategy/training-app-requirements-refinement (wip).md`:
- **App Structure — The Four Layers**: data → goal → constraints → plan as the structural spine.
- **The Core Product Loop**: how people currently use LLMs for training and what the app replaces; includes a table of all inputs and their sources.
- **Bring Your Own LLM (BYOK)**: BYOK as a power-user option layered on top of a hosted LLM, not a requirement. Pragmatic path: start hosted, design data layer for BYOK later.
- **Core Positioning**: the app as an interface for the user's LLM — solves the briefing problem, reframes onboarding, makes Claude the product not a feature.
**What to do next:** No immediate action. Reference when designing the Claude prompt, the plan generation flow, or any future BYOK feature.  
**Last updated:** 2026-04-23

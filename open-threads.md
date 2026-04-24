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

## Claude Feedback Stubbed

**Status:** Done — stub in place  
**What was done:** `generateFeedback` in `prototype/src/claudeFeedback.js` returns `'Claude will populate this.'` immediately. No API calls are made. `ANTHROPIC_API_KEY` is not set in Vercel.  
**What to do next:** When ready to enable real feedback, remove the two stub lines at the top of `generateFeedback` and add `ANTHROPIC_API_KEY` to Vercel's Production environment only.  
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

## Plan Generation — Richer Parameters

**Status:** Design decision pending  
**What was done:** Identified the full parameter set the plan generator should use. Currently it only takes `goalType` and `daysPerWeek`. The full list agreed on:

1. Current FTP
2. Current weight
3. Current power distribution
4. Target goal
5. Target date
6. Week feedback — lifestyle signals and training misses
7. Consistency feedback — builds a character for when consistency drifts or holds
8. Coaching context — if self-coached: generate plan; if AI-coached: let user upload their existing plan as a .md file, treat it as highest priority input
9. Non-negotiables — informs what to include and exclude
10. Other types of training — treated as part of the training week, not noise
11. What they're keeping — cross-training that stays in the mix

**Key open question:** Parameters 6, 7, and 8 require Claude to act on meaningfully — a rule-based generator can only use them mechanically. Point 8 (AI coach upload) is also a new UX feature needing its own design. The decision needed is: do we un-stub Claude for plan generation and make this the primary Claude use case rather than daily commentary?  
**What to do next:** Decide whether to un-stub Claude for plan generation. If yes, design the prompt around all 11 parameters above. Point 8 (AI coach upload flow) needs separate UX design regardless.  
**Last updated:** 2026-04-23

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

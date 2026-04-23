# Open Threads

Active work in this project. Read at the start of every session and surface any open threads to the user. Update before every `/exit`.

---

## Connect Vercel to GitHub

**Status:** Not started  
**What was done:** GitHub repo created at github.com/mrfabs/flexatraining, pushed with all existing code. Vercel root directory is `prototype/` (set in `prototype/vercel.json`).  
**What to do next:** Go to vercel.com, import the `mrfabs/flexatraining` repo, set root directory to `prototype/`, and add all env vars from `prototype/.env.example`. Do NOT add `ANTHROPIC_API_KEY` yet — Claude feedback is stubbed with a placeholder and credits should not run until deliberately enabled.  
**Last updated:** 2026-04-23

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

## Stats Tab + Dashboard Rework

**Status:** Done  
**What was done:**
- New `Stats.jsx` screen with FTP/W/kg/Weight metrics and Sprint / Attack / Climb power breakdown. Breakdown values editable — changing one ripples to FTP estimate.
- New Stats tab added to App.jsx tab bar (Home / Stats / Profile).
- Dashboard reordered: Claude analysis at top → calendar → goal progress → activity. Numbers section removed from Dashboard.
- Rest day empty state now explains why rest matters.
- Calories added to activity row (uses Strava `calories` field).
- Onboarding Step 0: power breakdown now displayed below the three core metrics.
- Onboarding Step 2 (FTP goal): currency-style linked W ↔ W/kg inputs (typing either updates the other). Breakdown table shows "Now" vs "Target" columns side by side. Tapping a target value adjusts FTP.
- Onboarding Step 5: shows inferred training frequency from Strava before the life context question.
- Discipline renamed to Consistency throughout (onboarding, profile, mockData).
- Profile screen: removed "Your numbers", "Goal", and "Feedback history" sections. Those now live in Stats and Dashboard respectively.
- Dashboard: added "This week's plan" section showing all 7 days with session labels, intensity dots, duration, and completion markers from Strava data.
- Plan generation: removed `coaching === 'self'` gate — all users now get a plan generated at onboarding completion.
**What to do next:** Test the full onboarding flow end to end — particularly the breakdown tinkering and W/W/kg conversion. Verify the week plan section renders correctly after onboarding completes.  
**Last updated:** 2026-04-23

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

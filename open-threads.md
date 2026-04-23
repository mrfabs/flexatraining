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
**What to do next:** Test the full onboarding flow end to end — particularly the breakdown tinkering and W/W/kg conversion. Verify calories appear for power-meter rides.  
**Last updated:** 2026-04-23

---

## Target Audience Strategy

**Status:** Done  
**What was done:** Added "Who This App Is For" section to `strategy/training-app-requirements-refinement (wip).md`. Defines the primary user as an athlete who loves their sport but needs variety to stay consistent, and flags the product implications for coaching tone and cross-sport tracking.  
**What to do next:** No immediate action. Revisit when building the Claude coaching prompt or the cross-sport activity handling.  
**Last updated:** 2026-04-23

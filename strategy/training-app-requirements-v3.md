---
tags:
  - training-app
  - requirements
  - strategy
type: requirements
last-updated: 2026-04-20
related:
  - "[[training-app-vault]]"
  - "[[training-app-requirements-v2]]"
---

# Training App — Requirements v3

Builds on v2. This document covers only what is new or changed. All v2 requirements not mentioned here remain in force.

---

## FTP Explanation and Transparency

Every place the FTP value is shown, a tappable info icon (ⓘ) must be available. Tapping it reveals:

- Which Strava activity the FTP was detected from (name, date)
- The method used: "~20 min effort" / "estimated from ride power" / "estimated from long ride"
- The confidence level: High / Medium / Low
- The formula used (e.g. "Average power × 0.95 for a 20-min effort")

This applies on the Dashboard, the Your Numbers onboarding screen, and the Profile. The user should never have to wonder how their FTP was derived.

---

## Height Data

Withings returns height (meastype=4) alongside weight. Capture it whenever available and store it on the user profile. Height is not displayed prominently but is captured for future use (BMI, body composition context for the AI prompt). Show it in the Profile under Personal.

---

## Power Unit Toggle

The user can switch all power displays between watts (W) and watts per kilogram (W/kg) at any time. This preference persists across sessions.

The toggle applies to:
- FTP metric card on the Dashboard and Profile
- Normalised power (NP) display on activity rows in the feed
- Goal target display

When in W/kg mode, all power values are divided by the user's current weight. If weight is not set, the toggle is disabled.

---

## Weight Impact Awareness

On the FTP goal-setting step in onboarding, after the user enters a target FTP, the app shows a live weight impact panel if weight is available:

- "At your current weight of {X}kg, {targetW}W = {targetWkg} W/kg"
- "If you reach {X-3}kg, that becomes {targetWkgLighter} W/kg at the same power"

This is educational, not prescriptive. The app is showing what the arithmetic looks like — it is not encouraging weight loss. The framing should be neutral and factual.

---

## Inference Model — Confidence and Auto-Application

### Changed behaviour from v2

v2 always showed a confirmation step for inferred answers ("It seems like you X — does that sound right?"). v3 removes this for high-confidence inferences.

### New model

The app analyses the last 8 weeks of Strava activity and assigns a confidence level to all inferences:

| Activities in last 8 weeks | Confidence | Behaviour |
|---|---|---|
| 10 or more | High | Auto-apply silently. No question shown. |
| 5–9 | Medium | Show inference with "Based on your last X weeks" — user confirms or corrects |
| Fewer than 5 | Low | Show full picker. Inference (if any) pre-selects the most likely option as a suggestion only. |

### Data window transparency

Wherever an inference is shown (medium confidence), the confirmation card must state explicitly how far back the data analysis went: "Based on your last 8 weeks of Strava data."

This applies to: activity level, training frequency, training time preference, and structure relationship.

For high-confidence auto-applied inferences: the data window is shown in the Profile, next to the inferred field, as a small label ("Inferred from 8 weeks of data — tap to edit").

---

## Profile — Onboarding Data Visibility and Editing

All data gathered during onboarding must be visible in the Profile. This is the transparency principle: the user should be able to see exactly what the AI engine is working from.

### Fields to show

| Field | Source | Editable |
|---|---|---|
| Goal type + target + date | Onboarding | Yes (gated by removal question flow) |
| Activity level | Inferred or answered | Yes |
| Training days per week | Inferred or answered | Yes |
| Training time preference | Inferred or answered | Yes |
| Life context | Answered | Yes |
| Structure relationship | Inferred or answered | Yes |
| Discipline goal | Answered | Yes |
| Coaching approach | Answered | Yes |
| Non-negotiables | Answered | Yes (add free, remove gated) |
| Supporting activities | Inferred + answered | Yes |
| Activities kept for goal | Answered | Yes |

### Editing behaviour

Each field shows the current value. An "Edit" button opens an inline picker showing all options, with the current value pre-selected. The user can change to any option. Saving writes back to localStorage and Supabase (when auth is set up).

For inferred fields, the edit view shows the same options as onboarding, with a note: "Currently inferred from Strava. Override below."

---

## Activity RPE (Rate of Perceived Exertion)

Tapping any activity in the day feed opens an RPE rating panel below the row.

### RPE Scale

| Zone | Score | Description |
|---|---|---|
| Easy | 1–3 | Light effort. Could go all day. Breathing barely elevated. |
| Moderate | 4–6 | Steady and controlled. Sustainable for a long time. Breathing elevated but comfortable. |
| Hard | 7–8 | Uncomfortable. Breathing heavy. Could not maintain much longer. |
| All Out | 9–10 | Maximal effort. Everything is working. Cannot continue at this pace. |

### Interaction

- Slider from 1 to 10
- Zone label and description update live as the slider moves
- Save button confirms the rating
- Rated activities show a small RPE badge on the row (coloured by zone)
- Rating is saved per activity ID and persists across sessions

### Effect on the plan

RPE ratings add a second layer on top of TSS. A ride logged as Hard (RPE 8) with a TSS of 60 is weighted more heavily in the plan than a ride logged as Easy (RPE 3) with the same TSS. This surfaces subjective fatigue that power data alone cannot detect.

The Claude prompt and plan generation must include RPE data where available, weighted alongside TSS.

RPE data is stored locally and attached to the user's activity context in the AI prompt.

---

## Coaching Question

New onboarding step added after Discipline Goal (Step 7), before Non-Negotiables.

**Who coaches you?**

Options:
- **I coach myself** — the app generates a training plan and populates the calendar
- **I have a coach** — the app works alongside the coach; no plan is generated; feedback focuses on pattern analysis rather than prescription
- **An AI coaches me** — the user can connect their AI coaching assistant; the app imports context from those conversations to inform feedback (see below)

### If "I coach myself"

After onboarding completes, the app generates a 1-week training plan based on:
- Goal type (FTP or distance)
- Days per week
- Structure relationship
- Non-negotiables (excluded from training days)

The plan is seeded into the calendar for the current and next week. Planned sessions appear on days with no recorded Strava activity, styled distinctly from completed activities.

Session types for FTP goal: Base ride, Interval, Threshold, Long ride, Recovery.
Session types for distance goal: Base ride, Endurance build, Long ride, Recovery.

The plan regenerates at the 3-month check-in or when goal/availability settings change.

### If "I have a coach"

No plan is generated. The AI feedback focuses on observation and pattern analysis — what the data shows — rather than prescription. The feedback never overrides what a coach might have prescribed.

### If "An AI coaches me"

The user is prompted to connect their AI coaching assistant. In v1, this is a placeholder: the app explains that an integration is coming and asks the user to describe their AI setup. This data is captured and stored for when the integration is built. The specific AI platform (Claude, ChatGPT, etc.) and the mechanism for importing conversation context are open questions to resolve before building.

---

## Open Questions — New

### 12. AI coaching integration — platform and mechanism
If the user is coached by an AI, what does "connect your AI" mean in practice?
- Is this a Claude.ai conversation export? A generic API? A specific integration per platform?
- What data is extracted from the conversation — session instructions, feedback history, goals discussed?
- How frequently does the import happen — on demand, scheduled, or real-time?
- What happens if the AI's recommendations conflict with what the app's data shows?

### 13. RPE and plan weighting — algorithm
How exactly is RPE weighted against TSS in plan generation?
- Is it a multiplier? A flag? A subjective load score?
- If a user consistently rates easy rides as Hard (7-8), does the plan adjust downward in volume?
- How many RPE data points are needed before the plan starts adapting to them?

### 14. Plan regeneration triggers
The plan is initially generated at the end of onboarding. When does it regenerate?
- On every 3-month check-in (confirmed)
- When goal or availability settings change (confirmed)
- When the user manually requests a new plan?
- When RPE data suggests the current plan is consistently too hard or too easy?

### 15. Power unit toggle — goal display
When the user sets a goal in W/kg mode, is the stored goal in W or W/kg?
- If stored as W/kg, what happens when weight changes significantly?
- The safer default is to store all goals in absolute watts and display in W/kg when the toggle is on.

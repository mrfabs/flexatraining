---
tags:
  - training-app
  - requirements
  - strategy
type: requirements
last-updated: 2026-04-19
related:
  - "[[training-app-vault]]"
---

# Training App — Requirements v1

Initial scope definition. This is the source of truth for what we are building in version 1.

---

## What This App Does

Analyses a cyclist's performance data from Strava and provides natural language feedback on whether they are working sustainably toward their training goal. The primary metric lens is FTP, weight, and W/kg — not raw effort or impressive numbers. Consistency and adherence to a progression plan is what the app rewards.

---

## Platform

iOS native.

---

## Core User Flow

1. User signs in with Strava — this creates their Training App account automatically
2. User completes onboarding (see section below)
3. User connects their Withings scale via OAuth
4. User chooses: upload full Strava history or start from today's date
5. App analyses activity and weight data and tracks the three key metrics over time
6. Feedback is generated when the user misses consistent training 3 times in a row
7. The comment always prioritises consistency and sustainable progression over raw performance

---

## The Three Numbers Everything Revolves Around

| Metric | Notes |
|---|---|
| Rider weight (kg) | Pulled automatically from Withings — no manual entry |
| FTP (watts) | Detected automatically from Strava historical data and latest activity |
| W/kg | Calculated automatically from FTP ÷ weight |

All feedback and progress tracking must be framed in relation to these three numbers. If they are going up or down, the app explains what is influencing them.

---

## User Account

Created automatically from Strava OAuth. Fields populated from Strava profile:

- First name and surname
- Profile photo (from Strava)
- Date of birth (entered during onboarding if not available from Strava)

No separate username and password. Strava is the only login method.

---

## Onboarding Flow

Onboarding is where the app builds the context it needs to give honest, personalised feedback. Every question directly informs the Claude prompt. None of it is decoration.

The app re-asks all of these questions every 3 months, or sooner if the user's actual training volume diverges significantly from their stated availability.

### Step 1 — Goal

User sets an FTP target and a target date.

Before they proceed, the app cross-references the goal against their stated training availability (from Step 2) and Strava history (if uploaded). If the goal is not achievable in the time available at a sustainable rate of progression, the app says so — directly, before the user leaves onboarding.

This is a core product principle: **reality is always shared.** The app is a performance coach and a best friend, not a hype machine. If someone sets a goal that requires 10 hours a week but they have told the app they have 5, the app names the gap. It may suggest a revised target or a revised date. The user can keep their original goal anyway — but they do so knowing the numbers.

### Step 2 — Training availability

Two questions, answered via pickers:

**How many hours per week can you realistically train?**
Options: 3–5h / 5–8h / 8–12h / 12h+

**When do you prefer to train?**
Options: Mornings / Lunch / Evenings / When it works

The preferred time slot is not used to schedule anything — it is used to contextualise the data. A morning trainer who has had no morning activities for two weeks is a different signal than an "whenever" trainer with the same pattern.

### Step 3 — Life context

**What does your week look like?**
Options (picker): Busy professional / Shift worker / Flexible schedule / Student

**What does busy mean for you?**
Options (picker):
- Barely time to train — I fit it in where I can
- Regular schedule, but work always comes first
- I protect my training time but life still interrupts
- Training is a priority, other things flex around it

This distinction matters enormously for the Claude prompt. Two people who both call themselves "busy professionals" can have radically different relationships to consistency. The second question surfaces that difference so the feedback is calibrated to the actual situation, not a generic one.

### Step 4 — Relationship with structure

This is the question that calibrates the trigger engine. Two cyclists with identical data and identical goals need completely different coaching if one of them loves a plan and the other wings it. Getting this wrong produces feedback that feels irrelevant at best and patronising at worst.

**How do you relate to training structure?**
Options (picker):

- **I follow a plan and stick to it** — Committed to structure. Missing a session is a meaningful signal. The app can be precise and hold this person to what they said they would do.
- **I like a plan but adapt week to week** — Structured with flexibility. The shape of the week matters more than individual sessions. The app tracks weekly load against the target, not specific sessions.
- **I have rough targets but train when I feel good** — Semi-structured. The focus is whether the overall trajectory is pointing toward the goal, not whether Tuesday's intervals happened.
- **I train when I can and figure it out as I go** — Wing it. For this person, "missed session" is not a meaningful concept. The trigger engine must work differently: instead of flagging deviation from a plan, it constantly recomputes the realistic path to the goal based on the latest actual data and asks whether the current pattern can get them there.

### How this changes the trigger engine

The missed-session detection logic must branch based on this answer. Non-negotiables are always excluded from session-gap calculations before any trigger logic runs.

| Relationship with structure | What triggers feedback |
|---|---|
| Follows a plan | 3 sessions missed relative to stated weekly availability (excluding non-negotiables) |
| Adapts week to week | Weekly load falls below minimum threshold for 2 consecutive weeks |
| Trains when they feel good | Goal trajectory is no longer achievable at current rolling average |
| Wings it | Rolling 4-week load is declining and goal date is approaching — adaptive replan triggered |

The discipline goal adds a second layer on top of this. A wing-it user who is actively trying to build more structure gets gentle positive acknowledgement when they follow through on a planned session — the trigger fires in both directions: to flag drift, and to recognise progress toward the discipline goal itself.

For the wing-it user specifically, the Claude prompt shifts from "here is what you missed" to "here is what the data says is actually possible given how you train — and here is what needs to change if the goal still stands." The plan updates around the person rather than expecting the person to update around the plan.

### Step 5 — Discipline goal

Performance goals and discipline goals are separate things and the app treats them separately. Someone can be working toward an FTP of 280W while also working toward training more freely — less rigidity, more enjoyment. Or they can be a wing-it trainer who has decided they want to build more structure into their life. The two dimensions are independent.

**Do you have a discipline goal alongside your performance goal?**
Options (picker):

- **I want to build more structure** — aspiring toward consistency and plan-following. The app notices and acknowledges when they follow through, gently. Progress here is behavioural, not just numerical.
- **I'm fine with how I train now** — no discipline ambition either way. The app does not push structure on them or reward looseness.
- **I want to train more freely** — actively trying to let go of rigidity. Maybe they've been over-structured and it stopped being fun. The app supports loosening up as a legitimate goal and does not treat spontaneity as failure.

This answer changes what "a good week" means in the Claude prompt. For the person building structure, completing three planned sessions is worth naming — even if the numbers were modest. For the person trying to train more freely, a spontaneous long ride that wasn't in any plan is exactly right.

The discipline goal is also re-asked at the 3-month check-in. It is the answer most likely to evolve as the person changes.

### Step 6 — Non-negotiables

These are the things the user will always do regardless of the plan. The app must treat them as fixed anchors, not deviations.

**Is there anything in your training week that is non-negotiable?**

Common examples presented as a multi-select picker:
- Long ride with friends on weekends
- A specific weekly race or group ride
- Always take Monday off
- Never train on certain days (family, work)
- Specific events or sportives already in the calendar

The user can also add a free-text note for anything not covered by the options.

### How non-negotiables affect the app

Non-negotiables are not evaluated against the plan — they are woven into it. The app treats them as given and builds everything else around them.

Concretely:
- A Saturday group ride that adds 120 TSS is not "a deviation from the structure" — it is a fixed load that the rest of the week accounts for
- The app does not flag a non-negotiable as a missed structured session even if the effort was easy
- When computing weekly load and goal trajectory, non-negotiables are treated as reliable baseline volume
- The Claude prompt always has non-negotiables in context — it will never suggest "skip the group ride to focus on intervals"

The distinction between a non-negotiable and a preference matters: a non-negotiable is something the user has committed to regardless of how training is going. The app respects this without judgement.

### Step 7 — Optional calendar integration

Users can optionally connect their Apple Calendar or Google Calendar. This gives the app visibility into upcoming commitments — travel, long meetings, holidays — that will affect training availability.

With calendar access, the app can:
- Anticipate low-training weeks before they happen rather than flagging them after
- Distinguish between "missed training because life was genuinely full" and "missed training with no explanation"
- Give feedback that references real upcoming context ("you have a quiet week coming up — good time to rebuild volume")

Calendar integration is optional and explicitly consent-gated. Users who skip it get the same core experience, just without the forward-looking context.

**Open question:** Apple Calendar vs. Google Calendar vs. both — and whether this is v1 or deferred. See open questions below.

---

## Strava Integration

- User authenticates via Strava OAuth — this serves as both authentication and data source
- On first setup, user chooses: upload full history or start from today
- App syncs new activities automatically after setup

### Data pulled from Strava per activity

| Field | Notes |
|---|---|
| Activity type | Cycling prioritised; all types counted for TSS |
| Duration | |
| Heart rate | |
| Power numbers | Normalised power, average power, max power, best 20-min power |
| Cadence | |
| Elevation | |
| Surface type or virtual | Zwift and other virtual platforms counted separately |

Maps are explicitly out of scope for v1. Data only.

### FTP auto-detection

FTP is not manually entered. The app detects it automatically by:

- Scanning historical Strava data for best 20-minute power efforts
- Using the latest qualifying effort as the current FTP baseline
- Updating whenever a new activity produces a better or significantly different 20-minute power result

The threshold for "qualifying effort" needs to be defined during build (e.g. must be a sustained road or virtual ride, not an interval session anomaly).

### TSS handling

Cycling activities are the primary focus. TSS and load from non-cycling activities (running, strength, etc.) are included in weekly training load calculations because they count toward fatigue and recovery.

---

## Withings Integration

Confirmed in v1. Weight updates come exclusively from Withings — there is no manual weight entry.

- User connects Withings account via OAuth during onboarding
- Weight syncs automatically whenever a new Withings measurement is recorded
- W/kg recalculates automatically on each new weight reading

Users who do not own a Withings scale cannot track weight within the app. This is a deliberate constraint for v1.

---

## Natural Language Feedback

- Generated by Claude (Anthropic API)
- Triggered when the user misses consistent training 3 times in a row, as detected by a background scheduled job
- Tone: direct and honest — a performance coach and a best friend combined. Not brutal, but never soft. Reality is always shared.
- Focus: are the three key metrics trending in the right direction? Is the user working sustainably toward their goal, or ignoring what the data tells them?
- The app does not flatter. If someone is overtraining, it says so. If they are inconsistent, it says so. If their goal is unreachable at their current trajectory, it says so and says why.

### The honesty principle

The app treats the user as an adult who can handle the truth. The best feedback is not always comfortable. What makes this product useful — and different from a generic tracking app — is that it closes the gap between what the data shows and what the user might prefer to believe.

This means:
- If the goal is ambitious but achievable, the feedback is encouraging and specific
- If the goal requires more time than the user has available, the app names the arithmetic and may suggest a revised target or date
- If the user is training inconsistently, the feedback says so — without moralising, but without softening it either
- If the user is overtraining relative to their recovery capacity, the app flags it
- Missed weeks are not punished, but patterns of missed weeks are named

The prompt sent to Claude must always include: current metrics, goal, training availability, lifestyle context, recent activity data, and — where available — calendar context. Without the full picture, the feedback cannot be honest.

### Definition of "sustainable"

Sustainable means:

- No radical dietary changes reflected in sudden weight drops
- No radical spikes in training load — increases should be gradual and recoverable
- Not optimising for depletion: energy levels, recovery, and long-term adherence matter more than short-term performance peaks
- A programme that fits a busy life — the app recognises that missed weeks happen and does not punish them, but it does note when patterns of inconsistency are becoming a problem

The Claude prompt must encode these principles. The model should reference training load trends, weight stability, and goal timeline when forming its response.

---

## Data Privacy and Storage

### Principles

- Privacy-first. The app should store as little as possible.
- Ideal architecture: analyse Strava and Withings data live (re-fetched at session time) without caching raw activity data in a Training App database.
- What must be stored: user account record, goal, computed metric snapshots (FTP, weight, W/kg at each point in time), and generated feedback history. Raw activity streams from Strava should not be stored — they live in Strava.
- If a user deletes their account, all stored data is permanently deleted immediately. No soft deletes, no grace periods.
- Explicit user consent required before any data is collected or stored.

### Backend

Supabase for now, if persistent storage is required. Row-level security must be enabled so users can only ever access their own data. No admin backdoor to user data unless legally compelled.

### Regulatory

If available in the EU or UK, GDPR and UK GDPR apply. Right to erasure is a legal requirement. A privacy policy and data processing agreement are required before launch.

---

## Monetisation

This v1 scope represents the basic tier — the lowest level of the product, which must be exceptionally easy to use. Users who want richer data access, deeper analysis, or additional features in the future will pay for a higher tier.

Implications for v1:

- Keep the basic tier friction-free. Onboarding must be fast. Feedback must be immediately useful.
- Do not overengineer the basic tier with features that belong in a paid tier.
- The monetisation model (subscription vs. one-time, pricing, what sits behind a paywall) is not yet defined and should be decided before App Store submission.

---

## Out of Scope for v1

- Maps and route visualisation
- Coaching plans or structured workouts
- Social features
- Apple Watch app
- Android
- Manual weight entry
- Manual FTP entry

---

## Goals, Non-Negotiables, and Trade-offs — Editing Rules

### The asymmetry principle

Adding is free. Removing requires a conversation.

This is deliberate. The friction to remove is not punishment — it is accountability. Most goal abandonment happens impulsively in a low moment. A small amount of friction surfaces whether the removal is a considered decision or a reaction to a hard week. The questions also capture data the coaching engine should have: if a user removes a goal, the reason is as important as the act.

### Adding

Users can add a new goal or non-negotiable at any time with no friction. New additions are incorporated into the Claude prompt immediately.

### Removing — gated by questions

When a user attempts to remove a goal or non-negotiable, the app asks a short sequence of questions before the removal is confirmed.

**For goal removal:**
1. What changed? (picker: My life situation changed / This goal no longer feels right / I want to set a different goal / Something else)
2. Is this temporary or permanent? (picker: Temporary pause / Permanent change)
3. Would you like to adjust the goal instead? (e.g. change the target or the date rather than remove it entirely — presented as a prompt, not a gate)

If the user confirms removal, the goal is archived — not deleted. The history of having set and abandoned a goal is retained internally and available to the Claude prompt as context. A user who has abandoned three goals is coached differently from someone on their first.

**For non-negotiable removal:**
1. Why is this no longer non-negotiable? (picker: Life has changed / It was a temporary fixture / I want to be more flexible / Something else)
2. Should we treat it as a preference instead? (offer to downgrade rather than remove)

The answers feed directly into the Claude prompt. "This user removed their goal because their life situation changed" is meaningfully different context from "this user removed their goal because it no longer felt right."

### Trade-offs

A concept to develop: users will eventually be able to name explicit trade-offs — things they knowingly sacrifice for other things (e.g. "I trade peak power for enjoying long social rides").

The theoretical grounding for this comes from **decisional balance**, a behavioural science technique described in [[Why Gym Deals Don't Build Habits]] (Greig Robinson, ustwo). The core idea: helping people articulate, in their own words, the real trade-offs between training consistently and not — grounded in their actual life, not an idealised version of it. The article argues this is one of only two techniques that consistently outperforms novelty features and incentives for long-term behaviour change. The other is structured problem solving: identifying barriers in advance and planning realistic responses for when they appear.

Both map directly onto what this app is trying to do. Trade-offs make the decisional balance explicit and persistent. The removal question flow (why are you removing this goal?) is a lightweight version of structured problem solving — anticipating the moment the user wants to quit and giving them a better conversation than simply letting them walk away.

Deserves its own exploration once the core product is stable. Trade-offs, when built, follow the same asymmetry: easy to add, questions required to remove.

### Pricing and visibility

The infrastructure for editable goals and non-negotiables — including the removal question flow and the archiving logic — is built now. The UI to edit them is hidden behind a paid tier. Basic tier users set their goals in onboarding and live with them until the 3-month re-check. The ability to edit freely between check-ins is a higher-tier feature.

---

## Open Questions

These are not gaps in thinking — they are decisions that are not yet ready to be made, or that depend on testing before they can be answered well.

### 1. Calendar integration scope
Optional calendar connection is confirmed as a feature. What is not yet decided:
- Apple Calendar only, Google Calendar only, or both?
- Is this in v1 or deferred to a later build once the core loop is validated?
- What specific calendar event types does the app look at? All events, or only those above a certain duration?

### 2. Goal types beyond FTP
Only FTP goals are defined. Open questions:
- Can users set a W/kg goal or a weight goal as an alternative to an FTP goal?
- Can they have more than one active goal at a time?
- What happens when a goal is achieved — does the app prompt a new one?

### 3. FTP detection edge cases
- What counts as a qualifying 20-minute effort? Sustained outdoor or virtual ride only, or does an interval session with a 20-minute block qualify?
- What if the user has no activity in Strava that maps cleanly to an FTP test? Does the app estimate from shorter maximal efforts, or flag that FTP is unknown?
- How does the app handle a significant FTP drop — does it update downward, or treat it as an anomaly?

### 4. Ambitious goal response design
The honesty principle is defined — the app tells the user when their goal is not achievable at their current trajectory. What is not yet designed:
- Does the app suggest a revised target, a revised date, or both?
- Does it present this as a blocking screen (you must acknowledge before proceeding) or an advisory (you can keep the goal, here is the gap)?
- What is the exact tone — clinical and data-led, or warmer and coaching-led?

### 5. Periodic re-check design
Onboarding questions are re-asked every 3 months. Not yet decided:
- Is this a full onboarding replay, or a lighter "anything changed?" check?
- How is the user prompted — push notification, in-app card, or both?
- What triggers an early re-check if training volume diverges sharply from stated availability?
- Should the relationship-with-structure answer be re-asked separately? It is the one most likely to change — someone who joins as a wing-it trainer may develop more structure over time, and the trigger engine must follow.

### 7. Discipline goal — what does progress look like in the app?
The discipline goal is defined but the experience of tracking it is not. Questions:
- Does the app surface discipline progress anywhere on the dashboard, or is it only reflected in the tone of the feedback?
- How does the app measure progress toward "more structure" — number of weeks where planned sessions were completed? Consistency score?
- For someone trying to train more freely, what signals that they are succeeding? Fewer skipped spontaneous opportunities? Reduced anxiety about the plan?
- These are not easy to quantify. The safer approach may be: the discipline goal lives entirely in the Claude prompt as context, and the feedback reflects it in tone rather than showing a metric. Decide before building.

### 8. Removal question flow — data model must be defined before infrastructure is built
The removal flow asks questions before a goal or non-negotiable is deleted. The answers need a schema before any code is written:
- What fields are stored per removal event? (timestamp, item type, reason picker answer, temporary vs permanent, whether the user accepted a downgrade instead)
- How are archived goals surfaced to the Claude prompt? As a list of past attempts with outcomes, or as a summary?
- What is the data model for a "downgraded" goal — one that was adjusted rather than removed? Is it a new goal record linked to the original, or a version history on the same record?
- How many removal events are retained? All of them indefinitely, or a rolling window?

This must be specced before building the removal infrastructure, because the schema is very hard to migrate later without losing history.

### 10. Non-negotiables — edge cases
- If a non-negotiable ride is missed one week (the group got rained off), does the app treat it as a missed non-negotiable, a missed training session, or neither?
- Can non-negotiables have a training intensity attached to them? A hard group ride and an easy social spin are both non-negotiable for different reasons and carry different TSS implications.
- How does the user add or remove non-negotiables after onboarding? Settings screen, or part of the 3-month re-check?

### 11. Wing-it adaptive replan — depth of logic
For users who train when they can, the app constantly recomputes a realistic path to their goal based on rolling actual data. Not yet defined:
- What is the rolling window — 4 weeks, 6 weeks?
- At what point does the replan tell the user the goal is no longer achievable, rather than just adjusting the path?
- Does the app suggest a revised goal date, or leave that for the user to decide?

### 6. Monetisation detail
The basic tier is this v1 scope. What sits behind a paid tier is not yet defined. To be decided before any public launch.

---

## Next Step

Resolve open questions 1 (calendar scope) and 4 (ambitious goal response design) — both affect the onboarding build directly. Then update the prototype to reflect the expanded onboarding flow before moving to auth and real data.

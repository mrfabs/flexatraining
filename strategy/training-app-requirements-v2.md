---
tags:
  - training-app
  - requirements
  - strategy
type: requirements
last-updated: 2026-04-20
related:
  - "[[training-app-vault]]"
  - "[[training-app-requirements-v1]]"
---

# Training App — Requirements v2

Builds on v1. Key changes: data-first inference principle applied throughout onboarding, expanded goal types (distance goals added), AI plan generation added to the core value proposition, InBody scoped as future integration with v1 API hook, "Your Numbers" pre-onboarding screen introduced, completion screen added.

---

## What This App Does

Analyses a cyclist's performance data from Strava and Withings, generates honest natural language feedback on whether the user is progressing sustainably toward their goal, and creates AI-generated training plans tailored to that goal. The primary metric lens is FTP, weight, and W/kg — not raw effort or impressive numbers. Consistency and adherence to a realistic progression plan is what the app rewards.

The app supports two goal types in v1:

- **Performance goals** — improve FTP to a target value by a target date
- **Distance goals** — complete a target distance (50 / 100 / 150 / 200km) by a target date

The AI engine creates a plan for each goal type and monitors the user's progress against it.

---

## Platform

iOS native.

---

## Core Design Principle

**The best design is no design.**

Everything that can be inferred from available data (Strava, Withings, and any connected source) must be inferred. The app should never ask the user for something it already knows or can reasonably calculate. Questions are a fallback — not a default.

This applies throughout onboarding and beyond. When the app has enough data to make a confident inference, it makes it and shows it to the user for confirmation. When it does not, it asks — but only then.

---

## Core User Flow

1. User signs in with Strava — account created automatically, training history and profile extracted immediately
2. "Your Numbers" screen — shows FTP, weight, and W/kg using available data; any missing value is flagged and must be resolved before proceeding
3. User completes onboarding questions: goal, training availability, activity level, life context, structure relationship, discipline goal, non-negotiables, supporting activities, optional calendar
4. App generates a plan based on the goal, availability, and life context
5. Completion screen — read-only summary with a personalised message confirming what was set
6. App monitors progress and generates feedback when the trigger conditions are met
7. The comment always prioritises consistency and sustainable progression over raw performance

---

## The Three Numbers Everything Revolves Around

| Metric | Source | Notes |
|---|---|---|
| Rider weight (kg) | Withings (primary); InBody (future) | No manual entry |
| FTP (watts) | Auto-detected from Strava history | No manual entry |
| W/kg | Calculated automatically | FTP ÷ weight — never entered directly |

All feedback, plans, and progress tracking are framed in relation to these three numbers. If they are going up or down, the app explains what is influencing them.

---

## User Account

Created automatically from Strava OAuth. The following is extracted without the user being asked:

- First name and surname
- Profile photo
- Date of birth (from Strava if available; asked during onboarding if not)
- Training history — last 6 months used to infer: training frequency, preferred training time of day, activity types, consistency patterns

No separate username or password. Strava is the only login method.

---

## Onboarding Flow

Onboarding builds the context the AI engine needs to generate honest, personalised feedback and plans. Every question directly informs the Claude prompt. None of it is decoration.

The app re-asks all of these questions every 3 months, or sooner if the user's actual training volume diverges significantly from their stated availability.

---

### Pre-Onboarding: Your Numbers

This is the first screen after authentication. It is not a question — it is a data display. The app shows what it already knows and flags what is missing.

**Three values are shown:**

| Value | State A — data available | State B — data missing |
|---|---|---|
| FTP | Detected value shown, source activity noted | "We couldn't detect your FTP yet — it will update after your first qualifying ride" |
| Weight | Latest Withings reading shown | "Connect your Withings scale to track weight" with a connect prompt |
| W/kg | Calculated and shown | Shown as "—" until both FTP and weight are available |

**Rules:**
- All three values are mandatory before the user can proceed to onboarding questions
- W/kg is never entered — it is always calculated
- FTP and Weight are the two actionable values: FTP is resolved by the app from Strava data; Weight requires Withings connection
- If FTP cannot be detected (insufficient Strava history), the value is shown as pending with a note that it will populate after the first qualifying ride — the user is not blocked from proceeding in this case alone
- If Weight is missing, the user must connect Withings before proceeding — this is the only hard gate

This screen also doubles as the education step. Each of the three numbers has a brief, tapable description explaining what it is and why it matters for cycling. These are shown inline, not on a separate screen, and are not skippable.

---

### Step 1 — Goal

**What's your goal?**

Two goal types are available in v1:

#### Option A: Improve my FTP

The app pre-fills the current FTP from Strava and asks for a target.

- "From Strava, your current FTP is **[X]W**. What's your target?"
- User enters a target FTP value
- User sets a target date

Before the user proceeds, the app cross-references the goal against their stated training availability and Strava history. If the target is not achievable at a sustainable rate of progression within the timeframe, the app says so directly — with the arithmetic — before onboarding is complete.

This is a core product principle: **reality is always shared.** The app may suggest a revised target or date, but the user can keep their original goal. They do so knowing the numbers.

#### Option B: Train for a specific distance

Available distances: **50km / 100km / 150km / 200km**

After the user selects a target distance, the app fetches their longest ride from Strava.

**If a longest ride is found:**
> "Your longest ride was **[X]km** on **[date]**. When would you like to complete your first **[target distance]**?"

The message is adapted based on proximity:
- If the longest ride is close to the target (e.g. longest = 80km, target = 100km): "You're already close — when would you like to hit that target?"
- If the gap is significant (e.g. longest = 40km, target = 150km): the message acknowledges the ambition and sets up the conversation around building toward it progressively

**If no ride data is available:**
> "When would you like to complete your first **[target distance]**?"

The plan the app generates for a distance goal is structured around volume progression and longest ride extension, not FTP improvement. The three numbers still anchor the dashboard, but the primary feedback lens shifts to training volume, ride frequency, and distance progression. See open questions for detail on the distance feedback model.

#### Future goal types (v2+, not in v1)

These are scoped out but listed to avoid designing against them:
- Train for a gran fondo
- Train for an ironman
- MyWhoosh / Zwift race
- Start cycling
- Train for an ultra race
- General training
- Recovering from a race
- Train for a specific elevation

---

### Step 2 — Training Availability

Two questions. Both are answered using inferred data where possible.

**How many hours per week can you realistically train?**

The app infers the current training frequency from Strava and presents it as a starting point:

> "You currently train about **[X] days** a week. Do you want to change that?"
- **No** — frequency is confirmed as-is
- **Yes** — slider from 1 to 7 days per week

If Strava has insufficient data to infer frequency, the question is asked directly with the slider.

**When do you prefer to train?**

Inferred from Strava activity timestamps — the app identifies whether the user predominantly trains in the morning, at lunch, in the evening, or at no consistent time.

Shown as: "It looks like you're a **[morning / evening / mixed]** trainer. Is that right?"
- **Yes** — confirmed
- **No** — picker: Mornings / Lunch / Evenings / When it works

If no reliable pattern can be found, the picker is shown directly.

The preferred time slot is used to contextualise data, not to schedule anything. A morning trainer with no morning activities for two weeks is a different signal than a "when it works" trainer with the same pattern.

---

### Step 3 — Activity Level

**How active are you at the moment?**

This question is answered automatically from Strava history. While the app analyses the data, a loading screen is shown:

> "Checking how active you are at the moment…"

Once inferred, the level is shown to the user with a label and a brief description. The user confirms or corrects it.

**Levels:**
- Just starting — I've never cycled before
- Getting back into it — I used to cycle but stepped away
- Expanding into cycling — I train actively, but cycling is new
- Consistently training
- High volume — I train every day or nearly every day

If insufficient data exists to make a confident inference, the options are shown as a picker.

This label is stored on the user's profile and used to calibrate the plan and the Claude prompt. It is re-assessed at the 3-month check-in.

---

### Step 4 — Life Context

**What does your week look like?**

This cannot be inferred without calendar access. It is always asked directly.

Options (picker):
- Barely time to train — I fit it in where I can
- Regular schedule, but work or family always comes first
- I protect my training time but life still interrupts
- Training is a priority, other things flex around it

This answer calibrates the feedback tone significantly. Two people who both describe themselves as "busy professionals" can have completely different relationships to consistency. This question surfaces that difference so the feedback is grounded in the actual situation, not a generic one.

---

### Step 5 — Relationship with Structure

This is the question that calibrates the trigger engine. Two cyclists with identical data and identical goals need completely different coaching if one of them loves a plan and the other wings it.

**How do you relate to training structure?**

The app attempts to infer this from Strava — looking at consistency of training days, time of day, and session regularity. If a confident inference can be made, it presents it:

> "It seems like you **[option selected]** — does that sound right?"
- **Yes** — confirmed
- **No** — picker shown

If no reliable pattern is found, the picker is shown directly.

**Options:**
- **I follow a plan and stick to it** — Committed to structure. Missing a session is a meaningful signal. The app holds this person to what they said they would do.
- **I like a plan but adapt week to week** — Structured with flexibility. The shape of the week matters more than individual sessions. Weekly load is tracked against target, not specific sessions.
- **I have rough targets but train when I feel good** — Semi-structured. The focus is whether the overall trajectory is pointing toward the goal, not whether Tuesday's intervals happened.
- **I train when I can and figure it out as I go** — Wing it. "Missed session" is not a meaningful concept. The trigger engine constantly recomputes a realistic path to the goal based on actual data and asks whether the current pattern can get them there.

#### How this changes the trigger engine

The missed-session detection logic branches based on this answer. Non-negotiables are always excluded from session-gap calculations before any trigger logic runs.

| Relationship with structure | What triggers feedback |
|---|---|
| Follows a plan | 3 sessions missed relative to stated weekly availability (excluding non-negotiables) |
| Adapts week to week | Weekly load falls below minimum threshold for 2 consecutive weeks |
| Trains when they feel good | Goal trajectory no longer achievable at current rolling average |
| Wings it | Rolling 4-week load is declining and goal date is approaching — adaptive replan triggered |

For the wing-it user specifically, the Claude prompt shifts from "here is what you missed" to "here is what the data says is actually possible given how you train — and here is what needs to change if the goal still stands." The plan updates around the person rather than expecting the person to update around the plan.

---

### Step 6 — Discipline Goal

Performance goals and discipline goals are separate things. The app treats them separately.

**Do you have a discipline goal alongside your performance goal?**

Options (picker):
- **I want to build more structure** — aspiring toward consistency and plan-following. The app notices and acknowledges when they follow through, gently. Progress here is behavioural, not numerical.
- **I'm fine with how I train now** — no discipline ambition either way. The app does not push structure or reward looseness.
- **I want to train more freely** — actively trying to let go of rigidity. The app supports loosening up as a legitimate goal and does not treat spontaneity as failure.

This answer changes what "a good week" means in the Claude prompt. For someone building structure, completing three planned sessions is worth naming — even if the numbers were modest. For someone trying to train more freely, a spontaneous long ride that wasn't in any plan is exactly right.

The discipline goal is re-asked at the 3-month check-in. It is the answer most likely to evolve as the person changes.

---

### Step 7 — Non-Negotiables

These are the things the user will always do regardless of the plan. The app treats them as fixed anchors, not deviations.

**Is there anything in your training week that is non-negotiable?**

Common examples shown as a multi-select picker:
- Long ride with friends on weekends
- A specific weekly race or group ride
- Always take Monday off
- Never train on certain days (family, work)
- Specific events or sportives already in the calendar

The user can add a free-text note for anything not in the list.

#### How non-negotiables affect the app

Non-negotiables are woven into the plan — not evaluated against it. The app treats them as given and builds everything else around them.

Concretely:
- A Saturday group ride adding 120 TSS is not "a deviation from structure" — it is fixed load that the rest of the week accounts for
- Non-negotiables are never flagged as missed structured sessions
- When computing weekly load and goal trajectory, non-negotiables are treated as reliable baseline volume
- The Claude prompt always has non-negotiables in context — the app will never suggest "skip the group ride to focus on intervals"

---

### Step 8 — Supporting Activities

This step builds a picture of the user's full training life, not just cycling. Other activities affect fatigue, recovery, and what a realistic training week actually looks like. They also tell the Claude prompt what the user values beyond the bike.

The step has two screens shown in sequence.

#### Screen A: What else are you into?

**"What else do you train?"**

The app infers this from Strava — any non-cycling activity type logged in the user's history is pre-selected. The full list is shown; inferred activities appear checked by default.

**Activity list:**
- Running
- Swimming
- Weight training / strength
- Stretching / mobility / yoga
- Rowing
- Hiking / walking
- Pilates
- Football or team sports
- Rock climbing
- Martial arts / boxing
- Other (free text)

The user can add anything the list misses via free text. They can also deselect anything that was incorrectly inferred.

All selected activities are saved to the user profile and become visible in the app alongside their cycling data.

#### Screen B: What are you keeping for your goal?

Shown immediately after Screen A, using the same list.

**"Of those, which will you keep while working toward your goal?"**

All activities selected on Screen A appear here, checked by default. The user unselects anything they are pausing or deprioritising for the duration of the goal.

The framing matters: this is not asking the user to give things up — it is asking them to be intentional about what stays in. Everything starts selected; the user removes what doesn't fit.

**How this affects the app:**

| Activity status | Effect |
|---|---|
| Selected on both screens | Counted toward weekly training load; included in Claude prompt as ongoing context |
| Selected on A, removed from B | Noted in user profile as a paused activity; excluded from load calculations; Claude is aware the user has stepped back from it |
| Not selected on A | Not tracked; not in the prompt |

Concretely:
- A user who keeps weight training earns credit for those sessions in their weekly load — their cycling plan accounts for the fatigue they create
- A user who removes running from their goal-period activities is not penalised for skipping a run, because the app knows runs are off the table for now
- The Claude prompt always has the full picture: what the user does, and what they have chosen to focus on

The "kept" activity list is re-reviewed at the 3-month check-in. As goals evolve, what gets paused or resumed changes.

---

### Step 9 — Optional Calendar Integration

Users can optionally connect Apple Calendar or Google Calendar. This gives the app visibility into upcoming commitments — travel, long meetings, holidays — that will affect training availability.

With calendar access, the app can:
- Anticipate low-training weeks before they happen, not after
- Distinguish between "missed training because life was genuinely full" and "missed training with no explanation"
- Give feedback that references real upcoming context

Calendar integration is optional and explicitly consent-gated. Users who skip it get the same core experience without the forward-looking context.

Open questions on calendar scope remain (see below).

---

### Completion Screen

Read-only. No editing.

After the final step, the app shows a personalised summary message confirming what was set during onboarding. The message reflects the user's goal, their current numbers, and the plan the app has created.

Example for a distance goal:
> "You're aiming to ride **100km** by **[date]**. Your longest ride so far was **62km**. Based on how you train, we've built a plan to get you there. Let's go."

Example for an FTP goal:
> "You're targeting **280W** by **[date]** — up from your current **241W**. You train 4 days a week and protect your Thursday evening sessions. Your plan is ready."

The message is generated by the AI engine using the full onboarding context. It is not a template — it is written to reflect the specific person.

---

## Key Screens

### Dashboard

The main screen of the app. Contains three sections stacked vertically: the week calendar, the day activity feed, and the metrics block.

#### Week Calendar

A full 7-day strip running Monday to Sunday, permanently visible at the top of the dashboard.

- The current day is selected by default on load
- Each day cell shows the day initial (M, T, W, T, F, S, S) and a small activity indicator — a dot or a subtle fill — if any activity was recorded that day; empty if it was a rest day
- Tapping any day updates the activity feed below to show that day's content
- The selected day is visually distinct from the rest
- The week always shows the current calendar week; navigation to previous weeks is an open question (see below)

This replaces the "Recent activity" list from the prototype. The feed is anchored to a day, not an undifferentiated reverse-chronological stream.

#### Day Activity Feed

Shown below the calendar. Updates whenever a different day is tapped.

- Displays all activities logged on the selected day, in chronological order
- Each activity shows: type, duration, key numbers (NP or average power if available, heart rate, distance), TSS or suffer score
- If no activities were logged: shows a rest day state with a neutral message — not a gap, not a failure, just a rest day
- If the selected day is today and no activities have been logged yet: shows a forward-looking state based on the plan (e.g. what was scheduled for today, if anything)

#### Metrics Block

Sits below the feed. Always visible regardless of which day is selected.

Contains the three key numbers (FTP, Weight, W/kg) as defined in the metrics section of this document. These are persistent context — they do not change based on the day selected.

---

### Profile

A complete, readable view of everything the app holds about the user. This is not a settings screen — it is a data transparency screen. The user can see exactly what context the AI engine is working from.

#### Sections

**Personal**
- Name and profile photo (from Strava)
- Date of birth / age
- Athlete since (Strava join date or first activity date)

**Connected sources**
- Strava — connection status, last sync timestamp
- Withings — connection status, last weight sync
- Calendar — connection status (if connected)
- InBody — shown as "coming soon" if not yet available

**Your numbers**
- Current FTP (value + source activity + date detected)
- Current weight (value + date of last Withings reading)
- Current W/kg (calculated)
- Historical sparklines or trend indicators for each — how these numbers have moved over time

**Your goal**
- Goal type and target (e.g. "FTP 280W by June 2026" or "Ride 100km by August 2026")
- Progress indicator
- Start value and start date
- Editing is gated: basic tier users can view but not edit freely between check-ins; the removal question flow applies if they attempt to remove or replace the goal

**Training profile**
- Activity level label (e.g. "Consistently training")
- Weekly training frequency
- Preferred training time
- Relationship with structure
- Discipline goal
- All fields are read-only; they update at the 3-month check-in

**Non-negotiables**
- Full list of confirmed non-negotiables
- Removal gated by the question flow (see editing rules)
- Adding new ones is available with no friction

**Supporting activities**
- Full list from Step 8: all activities the user selected
- "Keeping for goal" subset shown distinctly — e.g. a checked/unchecked state or two grouped lists
- Re-editable at the 3-month check-in; may be editable mid-cycle in a paid tier

**Feedback history**
- Chronological list of all AI feedback messages generated for this user
- Each entry shows: date, a short excerpt, and a way to expand to the full message
- Read-only

#### Editing rules on the profile

The profile is primarily read-only for basic tier users between check-ins. The exceptions are:
- Non-negotiables: can add freely, removal gated by question flow
- Goal: removal gated by question flow; editing freely between check-ins is a paid tier feature
- Connected sources: always editable (connect / disconnect at any time)

---

## Goal Types — Detail

### FTP Goal

- Feedback engine tracks FTP progression, weight stability, W/kg trend
- Trigger engine uses structure relationship to determine what "off track" means (see Step 5)
- Plan is built around progressive overload toward the FTP target within the available weekly hours

### Distance Goal

- Feedback engine tracks longest recent ride, weekly volume, and ride frequency — not FTP improvement
- Plan is built around progressive extension of long ride distance within the available weekly hours
- The three dashboard numbers (FTP, weight, W/kg) remain visible but are not the primary progress lens for this goal type
- Specific metrics and trigger conditions for distance goals are an open question (see below)

---

## Strava Integration

- User authenticates via Strava OAuth — serves as both authentication and primary data source
- On first setup, user chooses: upload full history or start from today
- App syncs new activities automatically after setup
- Last 6 months of history are used for onboarding inference (activity level, training frequency, structure relationship, FTP detection, longest ride)

### Data pulled from Strava per activity

| Field | Notes |
|---|---|
| Activity type | Cycling prioritised; all types counted for training load |
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

What counts as a qualifying effort (sustained road or virtual ride vs. interval session anomaly) is an open question to resolve during build.

### TSS handling

Cycling activities are the primary focus. TSS and load from non-cycling activities (running, strength, etc.) are included in weekly training load calculations because they count toward fatigue and recovery.

---

## Withings Integration

Confirmed in v1. Weight updates come exclusively from Withings — there is no manual weight entry.

- User connects Withings account via OAuth (prompted on the "Your Numbers" screen)
- Weight syncs automatically whenever a new measurement is recorded
- W/kg recalculates automatically on each new weight reading

Users who do not own a Withings scale cannot proceed past the "Your Numbers" screen. This is a deliberate constraint.

---

## InBody Integration

**Scope: future.** Not in v1 build.

The user will eventually be able to select which scale or body composition device they use. InBody is a planned option alongside Withings.

**v1 approach:** If InBody provides a public API with reasonable integration effort, connect it in v1 and begin capturing all available data. Only weight is surfaced in the UI for now — the additional body composition data (muscle mass, body fat percentage, etc.) is stored for use in later product versions. If the API is not straightforward, defer entirely to v2.

---

## Natural Language Feedback and Plan Generation

- Generated by Claude (Anthropic API)
- The app generates two outputs: an ongoing **training plan** (created at onboarding, updated as the user progresses) and periodic **natural language feedback** (triggered by the conditions below)
- Feedback tone: direct and honest — a performance coach and a best friend combined. Not brutal, but never soft. Reality is always shared.
- Plans are goal-type-specific: FTP plans focus on power progression; distance plans focus on volume and endurance extension

### Feedback triggers

Triggered when the conditions for the user's structure type are met (see Step 5 — Relationship with Structure), detected by a background scheduled job.

### The honesty principle

The app treats the user as an adult who can handle the truth. If the goal requires more than the user has available, the app names the arithmetic. If training is inconsistent, the feedback says so — without moralising, without softening.

- If the goal is ambitious but achievable: feedback is encouraging and specific
- If the goal requires more time than available: the app names the gap and may suggest a revised target or date
- If training is inconsistent: it says so
- If the user is overtraining relative to recovery capacity: the app flags it
- Missed weeks are not punished, but patterns of missed weeks are named

The prompt sent to Claude must always include: current metrics, goal, training availability, lifestyle context, recent activity data, structure relationship, discipline goal, non-negotiables, and — where available — calendar context.

### Definition of "sustainable"

- No radical weight drops suggesting extreme dietary changes
- No radical spikes in training load — increases should be gradual and recoverable
- Not optimising for depletion: energy levels, recovery, and long-term adherence matter more than short-term peaks
- A programme that fits the actual life the user described — not an idealised version of it

---

## Data Privacy and Storage

### Principles

- Privacy-first. Store as little as possible.
- Ideal architecture: analyse Strava and Withings data live (re-fetched at session time) without caching raw activity data
- What must be stored: user account record, goal, computed metric snapshots (FTP, weight, W/kg over time), generated feedback history, onboarding answers, training plan
- Raw activity streams from Strava are not stored — they live in Strava
- Account deletion removes all stored data immediately. No soft deletes, no grace periods.
- Explicit user consent required before any data is collected or stored

### Backend

Supabase. Row-level security must be enabled so users can only access their own data. No admin backdoor unless legally compelled.

### Regulatory

GDPR and UK GDPR apply if available in the EU or UK. Right to erasure is a legal requirement. A privacy policy and data processing agreement are required before launch.

---

## Monetisation

This v2 scope represents the basic tier — the lowest level of the product, which must be exceptionally easy to use.

Implications for v1:

- Keep the basic tier friction-free. Onboarding must be fast. Feedback must be immediately useful.
- Do not overengineer the basic tier with features that belong in a paid tier.
- The monetisation model (subscription vs. one-time, pricing, what sits behind a paywall) is not yet defined and should be decided before App Store submission.

---

## Out of Scope for v1

- Maps and route visualisation
- Social features
- Apple Watch app
- Android
- Manual weight entry
- Manual FTP entry
- InBody integration (unless API is trivial — see InBody section)
- Goal types beyond FTP and distance (gran fondo, ironman, etc.)

---

## Goals, Non-Negotiables, and Trade-offs — Editing Rules

### The asymmetry principle

Adding is free. Removing requires a conversation.

This is deliberate. The friction to remove is not punishment — it is accountability. Most goal abandonment happens impulsively in a low moment. A small amount of friction surfaces whether the removal is a considered decision or a reaction to a hard week. The questions also capture data the coaching engine should have.

### Adding

Users can add a new goal or non-negotiable at any time with no friction. New additions are incorporated into the Claude prompt immediately.

### Removing — gated by questions

**For goal removal:**
1. What changed? (picker: My life situation changed / This goal no longer feels right / I want to set a different goal / Something else)
2. Is this temporary or permanent? (picker: Temporary pause / Permanent change)
3. Would you like to adjust the goal instead? (presented as a prompt, not a gate)

If the user confirms removal, the goal is archived — not deleted. The history of setting and abandoning a goal is retained and available to the Claude prompt as context. A user who has abandoned three goals is coached differently from someone on their first.

**For non-negotiable removal:**
1. Why is this no longer non-negotiable? (picker: Life has changed / It was a temporary fixture / I want to be more flexible / Something else)
2. Should we treat it as a preference instead? (offer to downgrade rather than remove)

The answers feed directly into the Claude prompt.

### Trade-offs

A concept to develop: users will eventually name explicit trade-offs — things they knowingly sacrifice for other things (e.g. "I trade peak power for enjoying long social rides").

Grounded in **decisional balance**, a behavioural science technique described in [[Why Gym Deals Don't Build Habits]] (Greig Robinson, ustwo). Helping people articulate, in their own words, the real trade-offs between training consistently and not — grounded in their actual life. The removal question flow is a lightweight version of this in practice.

Deserves its own exploration once the core product is stable. Trade-offs follow the same asymmetry when built: easy to add, questions required to remove.

### Pricing and visibility

The infrastructure for editable goals and non-negotiables — including the removal question flow and archiving logic — is built now. The UI to edit freely between check-ins is a higher-tier feature. Basic tier users live with their onboarding settings until the 3-month re-check.

---

## Open Questions

### 1. Distance goal feedback model
The trigger engine and feedback model for distance goals is not yet fully defined. Questions to resolve before building:
- What specific metrics drive the feedback for a distance goal? (longest recent ride, weekly volume, ride frequency, TSS trend?)
- What does "off track" look like for a distance goal? Rolling average longest ride declining? Weekly volume below threshold?
- Does the plan generate specific target distances per week, or just volume targets?
- When the user achieves their target distance, what happens — does the app prompt a new, longer goal?

### 2. FTP detection when Strava history is thin
If FTP cannot be detected from Strava history, the app shows the value as pending. Open questions:
- Is the user blocked from the FTP-related features until a qualifying ride is recorded?
- Does the app estimate FTP from shorter maximal efforts as a fallback, or only from 20-minute efforts?
- How does the app handle a significant FTP drop — update downward, or treat as an anomaly?

### 3. Calendar integration scope
Optional calendar connection is confirmed. What is not yet decided:
- Apple Calendar only, Google Calendar only, or both?
- Is this in v1 or deferred to a later build once the core loop is validated?
- What event types does the app look at — all events, or only those above a certain duration?

### 4. Ambitious goal response design
The honesty principle is defined — the app tells the user when their goal is not achievable. What is not yet designed:
- Does the app suggest a revised target, a revised date, or both?
- Is this a blocking screen or an advisory?
- What is the exact tone — clinical and data-led, or warmer and coaching-led?

### 5. Periodic re-check design
Onboarding questions re-asked every 3 months. Not yet decided:
- Full replay or a lighter "anything changed?" check?
- How is the user prompted — push notification, in-app card, or both?
- What triggers an early re-check if training volume diverges sharply from stated availability?
- Should the structure relationship answer be re-asked separately given it is the one most likely to change?

### 6. Discipline goal — what does progress look like in the app?
The discipline goal is defined but the experience of tracking it is not. Options:
- Surface discipline progress on the dashboard as a metric
- Reflect it only in the tone of the Claude feedback (no separate UI element)

Safer default: lives entirely in the Claude prompt as context; feedback reflects it in tone rather than showing a metric. Decide before building.

### 7. Removal question flow — data model
The removal flow must be specced before any code is written:
- What fields are stored per removal event?
- How are archived goals surfaced to the Claude prompt — list of past attempts, or summary?
- What is the data model for a "downgraded" goal — adjusted rather than removed?
- How many removal events are retained?

### 8. Non-negotiables — edge cases
- If a non-negotiable ride is missed one week, is it treated as a missed non-negotiable, a missed training session, or neither?
- Can non-negotiables have an intensity attached (a hard group ride vs. an easy social spin carry different TSS implications)?
- How does the user add or remove non-negotiables after onboarding — settings screen or part of the re-check?

### 9. Wing-it adaptive replan — depth of logic
- What is the rolling window — 4 weeks, 6 weeks?
- At what point does the replan tell the user the goal is no longer achievable rather than just adjusting the path?
- Does the app suggest a revised goal date, or leave that to the user?

### 10. InBody API feasibility
To be assessed before v1 build is locked: does InBody offer a public developer API? If yes and integration is straightforward, connect in v1 and capture body composition data for future use. If not, defer.

### 11. Dashboard calendar — forward view
The calendar shows the current week by default and allows backward navigation through previous weeks. Activity feed loads from Strava for any past day selected. Not yet decided:
- Is there a forward view — showing scheduled or planned sessions for future days in the current week?
- How far back can the user navigate — unlimited, or capped at the date they joined the app (or the start of their Strava history)?

### 12. Monetisation detail
The basic tier is this v2 scope. What sits behind a paid tier is not yet defined. To be decided before any public launch.

---

## Next Steps

1. Resolve open question 1 (distance goal feedback model) — this affects plan generation design directly
2. Assess InBody API feasibility (open question 10) — quick research task
3. Resolve open question 4 (ambitious goal response design) — affects the onboarding build directly
4. Prototype the "Your Numbers" screen with real Strava + Withings data — foundation for everything else

# Who This App Is For

The target athlete is not the one who logs every session and follows a 16-week plan to the letter. That person already has tools. This app is for the athlete who genuinely loves their sport — cycling, in this case — but whose relationship with consistency is fragile. Not because they lack discipline or desire, but because monotony erodes their motivation faster than fatigue does. Doing the same thing, on the same days, in the same way eventually makes them feel trapped rather than trained.

This person is also capable. They can run, swim, hike, lift, do a yoga session on a Tuesday when the idea of getting on a bike feels suffocating. That cross-sport activity is not a failure of focus — it is how they stay sane, and ultimately how they stay in the sport at all. An app that treats a trail run as a deviation from the cycling plan will lose them. An app that treats it as part of a wider picture of an athlete who is still moving, still engaged, and still pointing toward their goal will keep them.

The design implication is significant. The coaching layer must read variety as a signal worth understanding, not correcting. The goal-tracking logic must be robust enough to stay meaningful even when weeks are irregular. And the way the app talks to this athlete must never make them feel like they have failed when they deviated — it must make them feel like someone is paying attention to the full picture and still believes in the direction of travel.

The single biggest risk with this audience is making them feel judged. The second biggest risk is making the app feel like one more thing that requires maintenance. Both kill retention faster than any missing feature.

---

# Context
Onboarding is essencial for the training app to gather enough context about the user. It must feel seemless and almost invisible. We must follow the principle "the best design is no design" and populate data and information based on the data that is available (strava, withings, inbody...). Everything must feel automatic so that user doesnt feel that she has to add a ton of details all the time to be able to reap the rewards of using this app.

# Onboarding Ordering
1. Authentication = Strava 
	1. The authentication is essencial, we must gather as much information about the user as possible so that they don't need to feel any informations themselves. This info is kept and shown to the user when it matters not everywhere:
		1. Basic information: Name, surname, age, gender
		2. Training information: (based on their last 6months of training) how frequently do they train, when they like training (mornings, lunch, evening, mix - our goal is to define their training patterns), what type of exercises they do most often (cycling is the most important for now but our goal is to list other activities they find important)
2. Guidance
	1. Explain important numbers in Cycling (see first question on onboarding questions below)
	2. Follow onboarding questions
3. Onboarding completed message - an overview of their goals and plans

# Onboarding Questions
In Cycling, there are 3 important foundational numbers for anything you want to do (tap on each to update):
* FTP (fetched from strava - we must have a description a nice description)
* Weight (trigger to add add weight via withings)
* Watts per Kilo (calculation based on ftp and weight)
**Whats your goal:**
* Improve my FTP
	* Followup questions
	* Whats your current weight ()
	* (Fetch data from strava) "From strava, your current FTP is X, what is your desired FTP?
		* Add number
* Train for a specific distance
	* Ride 50km
	* Ride 100km
	* Ride 150km
	* Ride 200km
* We will add these later options later (not for now, we will keep adding this in the future)
	* Train for a grandfondo
	* Train for an ironman
	* Mywhoosh/Zwift Race
	* Start Cycling
	* Train for an Ultra Race
	* General Training
	* Recovering from Race
	* Train for a specific elevation
**How active are you at the moment?**
* This answer must be automatically picked based on the amount of training available in strava. We infer this and keep it on our database. We assign a label and display it on the user's profle. 
* While we are fetching this data, the screens shows a loading indicator with message with message "checking how active your are at the moment". When we have an answer, we can display a nice message (tbd feel free to populate based on questions below)
* We only show this question if no data is available in strava, or only a little bit.
* Questions:
	* I am starting to train and I never cycled before
	* I am returning to cycling training, I used to cycle
	* I train actively, but I want to focus on cycling
	* I train consistently 
	* I am a semi-professional athelete, and I train everyday or almost everyday
**How many hours per week can you realistically train?**
* The answer of this questions should be inferred from strava data by showing how many days they already train e.g "you train 2 times a week right now, do you want to change the frequency of your training?"
	* Yes
		* How many days would you like to train:
			* Slider from 1 to 7 days a week
	* No
**When do you prefer to train?**
* It should be inferred by data available and labeled and display in users' profile (this will be the default for any questions we ask). If we have not enough data to infer, we ask:
	* Mornings
	* Lunch
	* Evenings
	* When it works
* The preferred time slot is not used to schedule anything — it is used to contextualise the data. A morning trainer who has had no morning activities for two weeks is a different signal than an "whenever" trainer with the same pattern.
**What does your week look like?**
* Impossible to infer through data unless user gives access to calendar.
* Options should be something like:
	* Barely time to train — I fit it in where I can
	* Regular schedule, but work or family always comes first
	* I protect my training time but life still interrupts
	* Training is a priority, other things flex around it
**How do you relate to training structure?**
* If we we can gather data around training structure based on training frequency and consistency of time of day based on data, we should pick an option for the user and ask "It seems that you (option selected), would you agree"*
	* Yes 
	* No
		* Pick one of the options below
* If we cannot find reliable data, we show options:
	- **I follow a plan and stick to it** — Committed to structure. Missing a session is a meaningful signal. The app can be precise and hold this person to what they said they would do.
	- **I like a plan but adapt week to week** — Structured with flexibility. The shape of the week matters more than individual sessions. The app tracks weekly load against the target, not specific sessions.
	- **I have rough targets but train when I feel good** — Semi-structured. The focus is whether the overall trajectory is pointing toward the goal, not whether Tuesday's intervals happened.
	- **I train when I can and figure it out as I go** — Wing it. For this person, "missed session" is not a meaningful concept. The trigger engine must work differently: instead of flagging deviation from a plan, it constantly recomputes the realistic path to the goal based on the latest actual data and asks whether the current pattern can get them there.





export const mockMetrics = {
  ftp: {
    current: 242,
    previous: 238,
    trend: 'up',
    detectedFrom: 'Road ride · 3 weeks ago',
  },
  weight: {
    current: 74.3,
    previous: 75.1,
    trend: 'down',
    lastSync: 'Today, 07:14',
  },
  wkg: {
    current: 3.26,
    previous: 3.16,
    trend: 'up',
  },
}

export const mockGoal = {
  metric: 'FTP',
  current: 242,
  target: 280,
  start: 220,
  targetDate: '1 Sep 2026',
  percentComplete: Math.round(((242 - 220) / (280 - 220)) * 100),
}

export const mockFeedback = {
  date: 'Today',
  triggered: 'low-volume',
  message:
    "Three weeks in and your numbers are moving — FTP up 4W, weight down 0.8kg, W/kg now at 3.26. That's real progress. But your volume has dropped from 9 hours two weeks ago to under 5 this week. At that pace, September starts to look tight. No need to panic. One solid week gets you back on track. You don't need a big ride. You need a consistent one.",
}

export const mockActivities = [
  {
    id: 1,
    type: 'Road Ride',
    date: 'Yesterday',
    duration: '1h 32m',
    avgPower: 181,
    normalizedPower: 212,
    hr: 148,
    tss: 82,
    virtual: false,
  },
  {
    id: 2,
    type: 'Zwift',
    date: '3 days ago',
    duration: '45m',
    avgPower: 196,
    normalizedPower: 218,
    hr: 155,
    tss: 58,
    virtual: true,
  },
  {
    id: 3,
    type: 'Run',
    date: '5 days ago',
    duration: '32m',
    avgPower: null,
    hr: 162,
    tss: 35,
    virtual: false,
  },
  {
    id: 4,
    type: 'Road Ride',
    date: '1 week ago',
    duration: '2h 05m',
    avgPower: 175,
    normalizedPower: 198,
    hr: 142,
    tss: 94,
    virtual: false,
  },
  {
    id: 5,
    type: 'Road Ride',
    date: '12 days ago',
    duration: '1h 48m',
    avgPower: 185,
    normalizedPower: 208,
    hr: 145,
    tss: 88,
    virtual: false,
  },
]

export const trainingHoursOptions = ['3–5h', '5–8h', '8–12h', '12h+']

export const trainingTimeOptions = ['Mornings', 'Lunch', 'Evenings', 'When it works']

export const lifestyleOptions = [
  'Busy professional',
  'Flexible schedule',
  'Shift worker',
  'Student',
]

export const busyDefinitionOptions = [
  'Barely time — I fit it in where I can',
  'Work always comes first',
  'I protect training time, but life interrupts',
  'Training is a priority — other things flex',
]

export const structureOptions = [
  { label: 'I follow a plan and stick to it', value: 'plan_follower' },
  { label: 'I like a plan but adapt week to week', value: 'adapts_week' },
  { label: 'I have rough targets, train when I feel good', value: 'feels_based' },
  { label: 'I train when I can and figure it out as I go', value: 'wings_it' },
]

export const consistencyOptions = [
  { label: 'I want to be more consistent', value: 'more_structure' },
  { label: "I'm happy with how I train now", value: 'content' },
  { label: 'I want to train more freely', value: 'more_freedom' },
]

export const nonNegotiablePresets = [
  'Long ride with friends on weekends',
  'Weekly virtual race',
  'Always take specific days off',
  'Specific cycling events',
]

export const distanceGoals = [
  { label: '50 km', value: 50 },
  { label: '100 km', value: 100 },
  { label: '150 km', value: 150 },
  { label: '200 km', value: 200 },
]

export const activityLevelOptions = [
  { label: "Just starting — I've never cycled before", value: 'beginner' },
  { label: 'Getting back into it — I used to cycle', value: 'returning' },
  { label: 'Expanding into cycling — I train other things', value: 'expanding' },
  { label: 'Consistently training', value: 'consistent' },
  { label: 'High volume — training every day or nearly', value: 'high_volume' },
]

export const lifeContextOptions = [
  'Barely time to train — I fit it in where I can',
  'Regular schedule, but work or family always comes first',
  'I protect my training time but life still interrupts',
  'Training is a priority, other things flex around it',
]

export const coachingOptions = [
  {
    value: 'self',
    label: "I don't have a coach",
    sub: 'The app generates a training plan and populates your calendar',
  },
  {
    value: 'coach',
    label: 'I have a coach',
    sub: 'The app works alongside your coach — analysis only, no plan generated',
    comingSoon: true,
  },
  {
    value: 'ai',
    label: 'An AI coaches me',
    sub: 'Connect your AI coaching assistant to share context with this app',
  },
]

export const rpeZones = [
  { min: 1, max: 3, label: 'Easy', description: 'Light effort. Could go all day. Breathing barely elevated.', color: '#34C759' },
  { min: 4, max: 6, label: 'Moderate', description: 'Steady and controlled. Sustainable for a long time. Breathing elevated but comfortable.', color: '#FF9500' },
  { min: 7, max: 8, label: 'Hard', description: 'Uncomfortable. Breathing heavy. Could not maintain much longer.', color: '#FF3B30' },
  { min: 9, max: 10, label: 'All Out', description: 'Maximal effort. Everything is working. Cannot continue at this pace.', color: '#AF52DE' },
]

export function getRpeZone(rpe) {
  return rpeZones.find(z => rpe >= z.min && rpe <= z.max) || rpeZones[0]
}

export const supportingActivities = [
  'Running',
  'Swimming',
  'Weight training',
  'Stretching / yoga',
  'Rowing',
  'Hiking / walking',
  'Pilates',
  'Football or team sports',
  'Rock climbing',
  'Martial arts / boxing',
]

// MyWhoosh VO2max workout catalogue — category/15
// Source: https://mywhooshinfo.com/workouts/category/15
// Rule: always pick a matching workout from this list when suggesting VO2 max training.
// Duration is stored in minutes for easy matching.

const BASE = 'https://mywhooshinfo.com/workouts/workout'

export const vo2maxWorkouts = [
  { name: '12min 30/30\'s #2',          duration: 74,  tss: 81,  if: 0.81, slug: '12min-30-30-s-2' },
  { name: '16min 30/30\'s #1',          duration: 86,  tss: 99,  if: 0.83, slug: '16min-30-30-s-1' },
  { name: '3min Max Aerobic Power',      duration: 93,  tss: 107, if: 0.83, slug: '3min-max-aerobic-power-2pj6' },
  { name: '40/20 Efforts',              duration: 51,  tss: 66,  if: 0.88, slug: '40-20-efforts' },
  { name: '40/20\'s #1',                duration: 52,  tss: 55,  if: 0.80, slug: '40-20-s-1' },
  { name: '40/20\'s #2',                duration: 58,  tss: 71,  if: 0.86, slug: '40-20-s-2' },
  { name: '4min 30/30\'s',              duration: 57,  tss: 57,  if: 0.78, slug: '4min-30-30-s' },
  { name: '4min Best effort!',          duration: 57,  tss: 48,  if: 0.72, slug: '4min-best-effort-ofg6' },
  { name: '5min 30/30\'s',              duration: 60,  tss: 50,  if: 0.71, slug: '5min-30-30-s' },
  { name: '5min Max Aerobic',           duration: 62,  tss: 74,  if: 0.85, slug: '5min-max-aerobic-axwq' },
  { name: '6min 30/30\'s',              duration: 63,  tss: 54,  if: 0.72, slug: '6min-30-30-s' },
  { name: '6min Best effort!',          duration: 60,  tss: 62,  if: 0.79, slug: '6min-best-effort-ln15' },
  { name: '7min 30/30\'s',              duration: 64,  tss: 59,  if: 0.74, slug: '7min-30-30-s' },
  { name: '8min 30/30\'s',              duration: 67,  tss: 66,  if: 0.77, slug: '8min-30-30-s' },
  { name: 'Controlled 30/30\'s #1',     duration: 51,  tss: 55,  if: 0.81, slug: 'controlled-30-30-s-1' },
  { name: 'Controlled 30/30\'s #2',     duration: 59,  tss: 68,  if: 0.84, slug: 'controlled-30-30-s-2' },
  { name: 'Depleting 4\'s',             duration: 57,  tss: 64,  if: 0.83, slug: 'depleting-4-s' },
  { name: 'Endurance into Max Aerobic', duration: 38,  tss: 35,  if: 0.75, slug: 'endurance-into-max-aerobic' },
  { name: 'Escalating 3min VO2max',     duration: 52,  tss: 60,  if: 0.83, slug: 'escalating-3min-vo2max' },
  { name: 'Intermittent 30/15\'s #1',   duration: 30,  tss: 27,  if: 0.74, slug: 'intermittent-30-15-s-1' },
  { name: 'Intermittent 30/15\'s #2',   duration: 32,  tss: 32,  if: 0.78, slug: 'intermittent-30-15-s-2' },
  { name: 'Intermittent 30/15\'s #3',   duration: 35,  tss: 39,  if: 0.82, slug: 'intermittent-30-15-s-3' },
  { name: 'Low Cadence, Reloaded #1',   duration: 64,  tss: 76,  if: 0.85, slug: 'low-cadence-reloaded-1' },
  { name: 'Low Cadence, Reloaded #2',   duration: 66,  tss: 82,  if: 0.87, slug: 'low-cadence-reloaded-2' },
  { name: 'Low Cadence, Reloaded #3',   duration: 66,  tss: 84,  if: 0.87, slug: 'low-cadence-reloaded-3' },
  { name: 'Low Cadence, Reloaded #4',   duration: 66,  tss: 85,  if: 0.88, slug: 'low-cadence-reloaded-4' },
  { name: 'Max Aerobic #5',             duration: 62,  tss: 72,  if: 0.84, slug: 'max-aerobic-5' },
  { name: 'Max Aerobic Climb #1',       duration: 70,  tss: 81,  if: 0.84, slug: 'max-aerobic-climb-1' },
  { name: 'Max Aerobic Climb #2',       duration: 64,  tss: 72,  if: 0.82, slug: 'max-aerobic-climb-2' },
  { name: 'Max Aerobic Climb #3',       duration: 61,  tss: 70,  if: 0.83, slug: 'max-aerobic-climb-3' },
  { name: 'Max Aerobic Declining',      duration: 60,  tss: 68,  if: 0.83, slug: 'max-aerobic-declining' },
  { name: 'Micro-VO2 #1',              duration: 60,  tss: 70,  if: 0.84, slug: 'micro-vo2-1' },
  { name: 'Micro-VO2 #2',              duration: 63,  tss: 76,  if: 0.85, slug: 'micro-vo2-2' },
  { name: 'Milano-Sanremo',             duration: 61,  tss: 64,  if: 0.80, slug: 'milano-sanremo' },
  { name: 'Over Ones',                  duration: 70,  tss: 93,  if: 0.89, slug: 'over-ones' },
  { name: 'Prologue',                   duration: 34,  tss: 44,  if: 0.89, slug: 'prologue' },
  { name: 'Pushing and Pulling #1',     duration: 66,  tss: 74,  if: 0.82, slug: 'pushing-and-pulling-1-liid' },
  { name: 'Pushing and Pulling #2',     duration: 72,  tss: 82,  if: 0.83, slug: 'pushing-and-pulling-2-nb45' },
  { name: 'Pushing and Pulling #3',     duration: 72,  tss: 89,  if: 0.86, slug: 'pushing-and-pulling-3' },
  { name: 'Short Climb Race Simulation',duration: 60,  tss: 81,  if: 0.91, slug: 'short-climb-race-simulation' },
  { name: 'Sprint/MAP/Sprint',          duration: 57,  tss: 78,  if: 0.91, slug: 'sprint-map-sprint' },
  { name: 'Stepped Down VO2max',        duration: 55,  tss: 69,  if: 0.87, slug: 'stepped-down-vo2max' },
  { name: 'Supra-Threshold #1',         duration: 63,  tss: 74,  if: 0.84, slug: 'supra-threshold-1' },
  { name: 'Supra-Threshold #2',         duration: 64,  tss: 79,  if: 0.86, slug: 'supra-threshold-2' },
  { name: 'Supra-Threshold into VO2 #1',duration: 60,  tss: 65,  if: 0.81, slug: 'supra-threshold-into-vo2-1' },
  { name: 'Supra-Threshold into VO2 #2',duration: 63,  tss: 70,  if: 0.82, slug: 'supra-threshold-into-vo2-2' },
  { name: 'VO2max 3min & 2min',         duration: 69,  tss: 82,  if: 0.85, slug: 'v02max-3min-2min' },
  { name: 'VO2max Declining 6min',      duration: 62,  tss: 80,  if: 0.89, slug: 'v02max-declining-6min' },
  { name: 'VO2max Increase #1',         duration: 57,  tss: 75,  if: 0.89, slug: 'v02max-increase-1' },
  { name: 'VO2max #1',                  duration: 60,  tss: 64,  if: 0.80, slug: 'vo2max-1' },
  { name: 'VO2max #2',                  duration: 60,  tss: 63,  if: 0.80, slug: 'vo2max-2' },
  { name: 'VO2max #3',                  duration: 40,  tss: 38,  if: 0.76, slug: 'vo2max-3' },
  { name: 'VO2max #4',                  duration: 66,  tss: 82,  if: 0.87, slug: 'vo2max-4' },
  { name: 'VO2max #5',                  duration: 62,  tss: 72,  if: 0.84, slug: 'vo2max-5' },
  { name: 'VO2max #6',                  duration: 61,  tss: 74,  if: 0.86, slug: 'vo2max-6' },
  { name: 'VO2max 3min #1',             duration: 70,  tss: 74,  if: 0.80, slug: 'vo2max-3min-1' },
  { name: 'VO2max 3min #2',             duration: 58,  tss: 66,  if: 0.83, slug: 'vo2max-3min-2' },
  { name: 'VO2max 4min #1',             duration: 54,  tss: 56,  if: 0.79, slug: 'vo2max-4min-1' },
  { name: 'VO2max 4min #2',             duration: 59,  tss: 65,  if: 0.82, slug: 'vo2max-4min-2' },
  { name: 'VO2max 5min #1',             duration: 67,  tss: 76,  if: 0.83, slug: 'vo2max-5min-1' },
  { name: 'VO2max Climbing #1',         duration: 60,  tss: 68,  if: 0.83, slug: 'vo2max-climbing-1' },
  { name: 'VO2max Climbing #2',         duration: 80,  tss: 90,  if: 0.82, slug: 'vo2max-climbing-2' },
  { name: 'VO2max Climbing #3',         duration: 63,  tss: 76,  if: 0.85, slug: 'vo2max-climbing-3' },
  { name: 'VO2max Declining',           duration: 62,  tss: 80,  if: 0.89, slug: 'vo2max-declining' },
  { name: 'VO2max Descending',          duration: 57,  tss: 72,  if: 0.88, slug: 'vo2max-descending' },
  { name: 'VO2max Extending Climbs',    duration: 62,  tss: 81,  if: 0.89, slug: 'vo2max-extending-climbs' },
  { name: 'VO2max!',                    duration: 40,  tss: 38,  if: 0.76, slug: 'vo2max' },
  { name: 'Zone 2 into 30/15\'s',       duration: 57,  tss: 54,  if: 0.76, slug: 'zone-2-into-30-15-s' },
  { name: 'Zone 2 into Max Aerobic',    duration: 38,  tss: 35,  if: 0.75, slug: 'zone-2-into-max-aerobic' },
]

// Returns the full URL for a workout
export function workoutUrl(workout) {
  return `${BASE}/${workout.slug}`
}

// Suggests the best matching workout given available time (minutes) and target TSS.
// If no duration preference, matches by TSS alone.
export function suggestVO2Workout(durationMinutes, targetTss) {
  let pool = vo2maxWorkouts

  // Filter to workouts within ±20 min if a duration is provided
  if (durationMinutes) {
    const nearby = pool.filter(w => Math.abs(w.duration - durationMinutes) <= 20)
    if (nearby.length > 0) pool = nearby
  }

  // Pick closest TSS match within the pool
  return pool.reduce((best, w) => {
    const diff = Math.abs(w.tss - (targetTss || 65))
    const bestDiff = Math.abs(best.tss - (targetTss || 65))
    return diff < bestDiff ? w : best
  })
}

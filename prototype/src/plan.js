// Plan generation — produces a 1-week session schedule.
// Week is indexed Mon=0 … Sun=6. null = rest day.
//
// For Interval sessions (VO2 max), a matching MyWhoosh workout is attached
// to the session object as `workout` { name, duration, tss, if, slug }.

import { suggestVO2Workout } from './vo2maxWorkouts.js'

const FTP_SESSIONS = [
  { type: 'Base',      label: 'Base ride',      duration: 60,  intensity: 'easy'     },
  { type: 'Interval',  label: 'Intervals',       duration: 60,  intensity: 'hard'     },
  { type: 'Threshold', label: 'Threshold',       duration: 75,  intensity: 'hard'     },
  { type: 'Long',      label: 'Long ride',       duration: 120, intensity: 'moderate' },
  { type: 'Recovery',  label: 'Recovery ride',   duration: 45,  intensity: 'easy'     },
]

const DISTANCE_SESSIONS = [
  { type: 'Base',      label: 'Base ride',        duration: 60,  intensity: 'easy'     },
  { type: 'Endurance', label: 'Endurance build',  duration: 90,  intensity: 'moderate' },
  { type: 'Long',      label: 'Long ride',        duration: 180, intensity: 'moderate' },
  { type: 'Recovery',  label: 'Recovery ride',    duration: 45,  intensity: 'easy'     },
]

// Session sequences (by index into training days). Long ride always anchored to the last
// training slot of the week (typically Saturday).
const FTP_SEQUENCE      = ['Base', 'Interval', 'Threshold', 'Recovery', 'Base', 'Long', 'Recovery']
const DISTANCE_SEQUENCE = ['Base', 'Endurance', 'Recovery', 'Base', 'Endurance', 'Long', 'Recovery']

function findSession(sessions, type) {
  return sessions.find(s => s.type === type) || sessions[0]
}

// Returns a 7-element array (Mon-Sun). Each element is null or { type, label, duration, intensity }.
export function generateWeekPlan({ goalType = 'ftp', daysPerWeek = 4 }) {
  const sessions = goalType === 'distance' ? DISTANCE_SESSIONS : FTP_SESSIONS
  const sequence = goalType === 'distance' ? DISTANCE_SEQUENCE : FTP_SEQUENCE
  const days = Math.max(1, Math.min(daysPerWeek, 7))

  const week = Array(7).fill(null)

  // Prefer Saturday (index 5) for the long ride when days allow
  const candidates = [0, 2, 4, 5, 1, 3, 6]
  const trainingDays = []

  // Anchor long ride to Saturday if we have ≥ 2 days
  if (days >= 2 && !trainingDays.includes(5)) trainingDays.push(5)

  for (const c of candidates) {
    if (trainingDays.length >= days) break
    if (!trainingDays.includes(c)) trainingDays.push(c)
  }

  trainingDays.sort((a, b) => a - b)

  trainingDays.forEach((dayIndex, i) => {
    // Saturday always gets the long ride
    const type = dayIndex === 5 ? 'Long' : (sequence[i % sequence.length] || 'Base')
    const session = { ...findSession(sessions, type) }

    // Attach a MyWhoosh VO2max workout suggestion for interval sessions
    if (type === 'Interval') {
      session.workout = suggestVO2Workout(session.duration, null)
    }

    week[dayIndex] = session
  })

  return week
}

export function savePlan(athleteId, weekPlan) {
  localStorage.setItem(`plan_${athleteId}`, JSON.stringify(weekPlan))
}

export function loadPlan(athleteId) {
  const raw = localStorage.getItem(`plan_${athleteId}`)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

// Returns the planned session for a given JS Date (or null for rest).
export function getPlanForDate(athleteId, date) {
  const plan = loadPlan(athleteId)
  if (!plan) return null
  // JS getDay(): 0=Sun → map to Mon=0 index
  const jsDay = date.getDay()
  const monIndex = jsDay === 0 ? 6 : jsDay - 1
  return plan[monIndex] || null
}

const BASE = 'https://www.strava.com/api/v3'

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` }
}

// ── Fetch recent activities ──
export async function fetchActivities(accessToken, perPage = 20) {
  const res = await fetch(`${BASE}/athlete/activities?per_page=${perPage}`, {
    headers: authHeaders(accessToken),
  })
  if (!res.ok) throw new Error('Failed to fetch activities')
  return res.json()
}

// ── Fetch athlete profile ──
export async function fetchAthlete(accessToken) {
  const res = await fetch(`${BASE}/athlete`, {
    headers: authHeaders(accessToken),
  })
  if (!res.ok) throw new Error('Failed to fetch athlete')
  return res.json()
}

// ── Format seconds → "1h 32m" ──
export function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// ── Format date → relative label ──
export function formatDate(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 14) return '1 week ago'
  return `${Math.floor(diffDays / 7)} weeks ago`
}

// ── Map Strava sport_type to display ──
export function activityMeta(activity) {
  const type = activity.sport_type || activity.type || ''
  const isVirtual = activity.trainer || type === 'VirtualRide'

  const map = {
    Ride:           { emoji: '🚴', label: 'Road Ride',   cls: 'cycling' },
    VirtualRide:    { emoji: '🖥️', label: 'Zwift',       cls: 'virtual' },
    Run:            { emoji: '🏃', label: 'Run',          cls: 'run' },
    Walk:           { emoji: '🚶', label: 'Walk',         cls: 'run' },
    Swim:           { emoji: '🏊', label: 'Swim',         cls: 'run' },
    WeightTraining: { emoji: '🏋️', label: 'Strength',    cls: 'run' },
    Workout:        { emoji: '💪', label: 'Workout',      cls: 'run' },
  }

  return map[type] || { emoji: '🏅', label: type, cls: 'cycling' }
}

// ── Estimate TSS from power data ──
// Requires NP, FTP, and duration. Returns null if insufficient data.
export function estimateTSS(activity, ftp) {
  const np = activity.weighted_average_watts
  const duration = activity.moving_time
  if (!np || !ftp || !duration) return null
  const IF = np / ftp
  return Math.round((duration * np * IF) / (ftp * 3600) * 100)
}

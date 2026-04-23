// FTP auto-detection from Strava activity summaries.
// No streams API needed — works from the data already fetched for the activity list.
//
// Algorithm:
//   1. Filter for rides with real power data, duration >= 18 min
//   2. Estimate FTP per activity based on duration bracket
//   3. Return the highest estimate across qualifying activities (last 90 days)
//
// Confidence levels:
//   high   — activity duration 18–25 min (likely a 20-min test effort)
//   medium — activity duration 25–70 min (NP × 0.95 is a reasonable proxy)
//   low    — activity duration > 70 min (long ride; NP ≈ FTP for well-trained riders)

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

function estimateFromActivity(activity) {
  const np = activity.weighted_average_watts
  const avg = activity.average_watts
  const power = np || avg
  const durationMin = activity.moving_time / 60

  if (!power || durationMin < 18) return null

  if (durationMin >= 18 && durationMin <= 25) {
    // Best proxy for a 20-min FTP test
    return { ftp: Math.round(avg * 0.95), confidence: 'high' }
  }
  if (durationMin > 25 && durationMin <= 70) {
    return { ftp: Math.round(power * 0.95), confidence: 'medium' }
  }
  // Long ride — NP tracks closer to FTP; apply smaller discount
  return { ftp: Math.round(power * 0.975), confidence: 'low' }
}

export function detectFTP(activities) {
  const cutoff = Date.now() - NINETY_DAYS_MS

  const qualifying = activities.filter(a => {
    const type = a.sport_type || a.type || ''
    const isRide = type === 'Ride' || type === 'VirtualRide'
    const hasPower = a.average_watts > 0
    const longEnough = a.moving_time >= 18 * 60
    const recent = new Date(a.start_date).getTime() > cutoff
    return isRide && hasPower && longEnough && recent
  })

  let best = null
  let bestActivity = null

  for (const a of qualifying) {
    const estimate = estimateFromActivity(a)
    if (estimate && (!best || estimate.ftp > best.ftp)) {
      best = estimate
      bestActivity = a
    }
  }

  if (!best) return null

  return {
    ftp: best.ftp,
    confidence: best.confidence, // 'high' | 'medium' | 'low'
    sourceActivity: bestActivity,
    detectedAt: new Date().toISOString(),
  }
}

export function confidenceLabel(confidence) {
  return {
    high:   'Detected from ~20 min effort',
    medium: 'Estimated from ride power',
    low:    'Estimated from long ride',
  }[confidence] ?? 'Estimated'
}

// ── Power curve breakdown ─────────────────────────────────────────────────────
// Estimates best power for each duration from activity summaries.
// Sprint durations (5s–1min) anchor on max_watts; longer durations use
// real NP from matching rides, falling back to FTP-based estimates.

const RIDE_TYPES_SET = new Set(['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide'])

function bestNpForDuration(rides, targetSec, tol = 0.25) {
  const min = targetSec * (1 - tol)
  const max = targetSec * (1 + tol)
  const matching = rides.filter(a =>
    a.moving_time >= min && a.moving_time <= max &&
    (a.weighted_average_watts || a.average_watts)
  )
  if (!matching.length) return null
  return Math.max(...matching.map(a => a.weighted_average_watts || a.average_watts))
}

export function detectPowerBreakdown(activities, ftp) {
  const rides = activities.filter(a =>
    RIDE_TYPES_SET.has(a.sport_type || a.type) &&
    (a.max_watts > 0 || a.average_watts > 0)
  )
  if (!rides.length) return null

  const bestMax = Math.max(...rides.map(a => a.max_watts || 0))
  const hasSprint = bestMax > 100

  const s5  = hasSprint ? bestMax : null
  const s15 = hasSprint ? Math.round(bestMax * 0.82) : null
  const s30 = hasSprint ? Math.round(bestMax * 0.70) : null
  const s1m = hasSprint ? Math.round(bestMax * 0.58) : null

  const a2m  = bestNpForDuration(rides, 120)  ?? (ftp ? Math.round(ftp * 1.25) : null)
  const a3m  = bestNpForDuration(rides, 180)  ?? (ftp ? Math.round(ftp * 1.18) : null)
  const a5m  = bestNpForDuration(rides, 300)  ?? (ftp ? Math.round(ftp * 1.06) : null)
  const a10m = bestNpForDuration(rides, 600)  ?? (ftp ? Math.round(ftp * 1.01) : null)

  const c15m = bestNpForDuration(rides, 900)  ?? (ftp ? Math.round(ftp * 0.98) : null)
  const c20m = bestNpForDuration(rides, 1200) ?? (ftp ? Math.round(ftp / 0.95) : null)
  const c30m = bestNpForDuration(rides, 1800) ?? (ftp ? Math.round(ftp * 0.97) : null)
  const c45m = bestNpForDuration(rides, 2700) ?? (ftp ? Math.round(ftp * 0.96) : null)
  const c60m = bestNpForDuration(rides, 3600) ?? ftp ?? null

  return {
    sprint: [
      { label: '5s',   watts: s5  },
      { label: '15s',  watts: s15 },
      { label: '30s',  watts: s30 },
      { label: '1min', watts: s1m },
    ],
    attack: [
      { label: '2min',  watts: a2m  },
      { label: '3min',  watts: a3m  },
      { label: '5min',  watts: a5m  },
      { label: '10min', watts: a10m },
    ],
    climb: [
      { label: '15min', watts: c15m },
      { label: '20min', watts: c20m },
      { label: '30min', watts: c30m },
      { label: '45min', watts: c45m },
      { label: '60min', watts: c60m },
    ],
  }
}

// Inverse: given a power value for a specific breakdown entry, estimate FTP.
// Uses the same ratios as detectPowerBreakdown so they stay in sync.
const DURATION_TO_FTP_RATIO = {
  '5s': null, '15s': null, '30s': null, '1min': null, // sprint — not FTP-derived
  '2min': 1.25, '3min': 1.18, '5min': 1.06, '10min': 1.01,
  '15min': 0.98, '20min': 1 / 0.95, '30min': 0.97, '45min': 0.96, '60min': 1.0,
}

export function ftpFromDurationPower(label, watts) {
  const ratio = DURATION_TO_FTP_RATIO[label]
  if (!ratio || !watts) return null
  return Math.round(watts / ratio)
}

export function ftpExplanation(ftpResult) {
  if (!ftpResult) return null
  const a = ftpResult.sourceActivity

  const methods = {
    high:   '~20 min effort',
    medium: 'Estimated from ride power',
    low:    'Estimated from long ride',
  }

  const formulas = {
    high:   'Average power × 0.95 for a ~20-min effort',
    medium: 'Normalised power × 0.95',
    low:    'Normalised power × 0.975',
  }

  const confidenceLabels = {
    high:   'High',
    medium: 'Medium',
    low:    'Low',
  }

  return {
    activityName: a?.name || 'Unknown activity',
    activityDate: a
      ? new Date(a.start_date_local || a.start_date).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
        })
      : null,
    method: methods[ftpResult.confidence] || 'Estimated',
    confidenceLabel: confidenceLabels[ftpResult.confidence] || 'Unknown',
    formula: formulas[ftpResult.confidence] || '',
  }
}

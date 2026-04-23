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

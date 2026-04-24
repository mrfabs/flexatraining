import { useState, useEffect } from 'react'
import { getRpeZone } from './mockData.js'
import { fetchActivities, formatDuration, activityMeta, estimateTSS } from './strava.js'
import { detectFTP } from './ftp.js'
import { saveMetricSnapshot } from './auth.js'
import { getWithingsSession, fetchLatestWeight, getManualWeight } from './withings.js'
import { getPlanForDate, loadPlan } from './plan.js'
import { workoutUrl } from './vo2maxWorkouts.js'
import { generateFeedback, getCachedFeedback, cacheFeedback } from './claudeFeedback.js'

// ── Week / date helpers ──────────────────────────────────────────────────────

function getMondayOf(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  d.setHours(0, 0, 0, 0)
  return d
}

function getWeekDays(weekOffset = 0) {
  const monday = getMondayOf(new Date())
  monday.setDate(monday.getDate() + weekOffset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function toDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function groupByDate(activities) {
  const map = {}
  activities.forEach(a => {
    const key = a.start_date_local?.slice(0, 10)
    if (!key) return
    if (!map[key]) map[key] = []
    map[key].push(a)
  })
  return map
}

function getISOWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
}

function calcStreak(byDate) {
  let streak = 0
  const d = new Date()
  if (!byDate[toDateStr(d)]?.length) d.setDate(d.getDate() - 1)
  while (byDate[toDateStr(d)]?.length) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function hrZone(avgHr, maxHr) {
  if (!avgHr || !maxHr) return null
  const pct = avgHr / maxHr
  if (pct < 0.60) return 'Z1'
  if (pct < 0.70) return 'Z2'
  if (pct < 0.80) return 'Z3'
  if (pct < 0.90) return 'Z4'
  return 'Z5'
}

// ── Goal helpers ─────────────────────────────────────────────────────────────

function loadGoal(athleteId) {
  if (!athleteId) return null
  const raw = localStorage.getItem(`onboarding_profile_${athleteId}`)
  if (!raw) return null
  try {
    const p = JSON.parse(raw)
    if (!p.goalType) return null
    return {
      type: p.goalType,
      ftpTarget: p.ftpTarget ? parseFloat(p.ftpTarget) : null,
      distanceTarget: p.distanceTarget ? parseFloat(p.distanceTarget) : null,
      powerGoalMetric: p.powerGoalMetric || null,
      powerGoalTarget: p.powerGoalTarget ? parseFloat(p.powerGoalTarget) : null,
      targetDate: p.targetDate || null,
      startFtp: p.currentFtp ? parseFloat(p.currentFtp) : null,
      goalStartDate: p.goalStartDate || null,
      onboardedAt: p.onboardedAt || null,
    }
  } catch { return null }
}

// ── RPE helpers ──────────────────────────────────────────────────────────────

function getRpeRatings() {
  try { return JSON.parse(localStorage.getItem('rpe_ratings') || '{}') } catch { return {} }
}

function saveRpeRating(activityId, rpe) {
  const ratings = getRpeRatings()
  ratings[String(activityId)] = rpe
  localStorage.setItem('rpe_ratings', JSON.stringify(ratings))
}

// ── Feeling helpers ──────────────────────────────────────────────────────────

function getFeelingRatings() {
  try { return JSON.parse(localStorage.getItem('feeling_ratings') || '{}') } catch { return {} }
}

function saveFeelingRating(activityId, feeling) {
  const ratings = getFeelingRatings()
  ratings[String(activityId)] = feeling
  localStorage.setItem('feeling_ratings', JSON.stringify(ratings))
}

const FEELINGS = ['😴', '😐', '🙂', '💪', '🔥']

function FeelingSelector({ activityId }) {
  const [submitted, setSubmitted] = useState(!!getFeelingRatings()[String(activityId)])
  if (submitted) return null
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--separator)' }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>How did you feel?</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {FEELINGS.map(f => (
          <button
            key={f}
            onClick={() => { saveFeelingRating(activityId, f); setSubmitted(true) }}
            style={{
              flex: 1,
              background: 'var(--bg)',
              border: 'none',
              borderRadius: 10,
              padding: '10px 2px',
              fontSize: 20,
              cursor: 'pointer',
              fontFamily: 'var(--font)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {f}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── RPE row ──────────────────────────────────────────────────────────────────

function RpeRow({ activityId, onSave }) {
  const saved = getRpeRatings()[String(activityId)]
  const [rpe, setRpe] = useState(saved ?? 5)
  const zone = getRpeZone(rpe)

  return (
    <div className="rpe-panel">
      <div className="rpe-header">
        <span className="rpe-zone-label" style={{ color: zone.color }}>{zone.label}</span>
        <span className="rpe-score">{rpe}</span>
      </div>
      <p className="rpe-description">{zone.description}</p>
      <input
        type="range" min={1} max={10} step={1}
        value={rpe}
        onChange={e => setRpe(Number(e.target.value))}
        className="day-slider"
        style={{ '--thumb-color': zone.color }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', padding: '2px 2px 0' }}>
        <span>Easy</span><span>All Out</span>
      </div>
      <button
        className="rpe-save"
        onClick={() => { saveRpeRating(activityId, rpe); onSave(activityId, rpe) }}
      >
        Save RPE
      </button>
    </div>
  )
}

// ── Intensity bar (SVG) ──────────────────────────────────────────────────────

function IntensityBar({ ifValue }) {
  const segments = [
    { width: 12, pct: 0.50, color: '#34C759' },
    { width: 8,  pct: 0.75, color: '#FF9500' },
    { width: 40, pct: ifValue, color: '#FF3B30' },
    { width: 20, pct: 0.55, color: '#FF9500' },
    { width: 20, pct: 0.40, color: '#34C759' },
  ]
  const totalH = 36
  return (
    <svg width="100%" height={totalH} viewBox={`0 0 100 ${totalH}`} preserveAspectRatio="none"
      style={{ display: 'block', borderRadius: 6, overflow: 'hidden' }}>
      {segments.map((seg, i) => {
        const x = segments.slice(0, i).reduce((s, p) => s + p.width, 0)
        const barH = seg.pct * totalH
        return <rect key={i} x={x + 0.5} y={totalH - barH} width={seg.width - 1} height={barH} fill={seg.color} rx={2} />
      })}
    </svg>
  )
}

// ── Planned session card ─────────────────────────────────────────────────────

function PlannedSessionCard({ session }) {
  const intensityColor = { easy: 'var(--green)', moderate: 'var(--orange)', hard: 'var(--red)' }[session.intensity] || 'var(--primary)'

  return (
    <div className="planned-session-card">
      <div className="planned-session-header">
        <div className="planned-session-dot" style={{ background: intensityColor }} />
        <div className="planned-session-info">
          <div className="planned-session-label">{session.label}</div>
          <div className="planned-session-meta">
            {session.duration} min · {session.intensity}
          </div>
        </div>
      </div>

      {/* Objective / description (Claude will populate in future) */}
      <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Objective</div>
        <div style={{ fontSize: 13, color: session.objective ? 'var(--text)' : 'var(--text-tertiary)' }}>
          {session.objective || 'Claude will personalize this based on your recent training.'}
        </div>
        {session.targetZone && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
            Target: {session.targetZone}
          </div>
        )}
      </div>

      {session.workout && (
        <div className="mywhoosh-card" style={{ marginTop: 10 }}>
          <div className="mywhoosh-bar">
            <IntensityBar ifValue={session.workout.if} />
          </div>
          <div className="mywhoosh-details">
            <div className="mywhoosh-name">{session.workout.name}</div>
            <div className="mywhoosh-stats">
              <span>{session.workout.duration} min</span>
              <span className="mywhoosh-dot">·</span>
              <span>TSS {session.workout.tss}</span>
              <span className="mywhoosh-dot">·</span>
              <span>IF {session.workout.if}</span>
            </div>
          </div>
          <a href={workoutUrl(session.workout)} target="_blank" rel="noopener noreferrer" className="mywhoosh-link">
            View on MyWhoosh ›
          </a>
        </div>
      )}
    </div>
  )
}

// ── Goal progress bar (home) ──────────────────────────────────────────────────

function GoalProgressBar({ goal, currentFtp }) {
  if (!goal || !goal.targetDate) return null

  const isFtp = goal.type === 'ftp' && goal.ftpTarget
  const isPower = goal.type === 'power' && goal.powerGoalTarget && goal.powerGoalMetric
  if (!isFtp && !isPower) return null

  const startVal = goal.startFtp || currentFtp || 0
  const targetVal = isFtp ? goal.ftpTarget : goal.powerGoalTarget
  if (!startVal || startVal >= targetVal) return null

  const today = new Date()
  const startDate = goal.goalStartDate
    ? new Date(goal.goalStartDate + 'T12:00:00')
    : goal.onboardedAt
    ? new Date(goal.onboardedAt + 'T12:00:00')
    : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d })()
  const endDate = new Date(goal.targetDate + 'T12:00:00')

  const totalDays = Math.max(1, (endDate - startDate) / 86400000)
  const elapsedDays = Math.max(0, (today - startDate) / 86400000)
  const expectedPct = Math.min(100, (elapsedDays / totalDays) * 100)

  const current = currentFtp || startVal
  const valRange = targetVal - startVal
  const actualPct = Math.min(100, Math.max(0, ((current - startVal) / valRange) * 100))

  const diff = actualPct - expectedPct

  let barColor = 'var(--primary)'
  if (diff > 5) barColor = 'var(--green)'
  else if (diff < -10) barColor = 'var(--red)'
  else if (diff < -3) barColor = 'var(--orange)'

  const daysLeft = Math.ceil((endDate - today) / 86400000)
  const goalLabel = isFtp ? `FTP ${targetVal}W` : `${goal.powerGoalMetric} ${targetVal}W`
  const dateStr = endDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="section">
      <div className="goal-card">
        <div className="goal-header">
          <div>
            <div className="goal-title">{goalLabel}</div>
            <div className="goal-date">
              By {dateStr}{daysLeft > 0 ? ` · ${daysLeft} days to go` : ' · past target date'}
            </div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)' }}>{Math.round(actualPct)}%</div>
        </div>

        <div style={{ position: 'relative' }}>
          <div className="progress-track" style={{ overflow: 'visible', position: 'relative', marginBottom: 0 }}>
            <div className="progress-fill" style={{ width: `${actualPct}%`, background: barColor }} />
            {expectedPct > 1 && expectedPct < 99 && (
              <div style={{
                position: 'absolute',
                left: `${expectedPct}%`,
                top: -3, height: 12, width: 2,
                background: 'var(--text-tertiary)',
                borderRadius: 1,
                transform: 'translateX(-50%)',
              }} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Week plan section ────────────────────────────────────────────────────────

const PLAN_DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const INTENSITY_COLOR = {
  easy:     'var(--green)',
  moderate: 'var(--orange)',
  hard:     'var(--red)',
}

function WeekPlanSection({ athleteId, weekDays, byDate, weekOffset, onWeekBack, onWeekForward, ftp }) {
  const plan = athleteId ? loadPlan(athleteId) : null
  const todayStr = toDateStr(new Date())
  const [expandedDay, setExpandedDay] = useState(todayStr)

  useEffect(() => {
    setExpandedDay(weekOffset === 0 ? todayStr : toDateStr(weekDays[0]))
  }, [weekDays[0].getTime()])

  const weekLabel = weekOffset === 0
    ? 'This week'
    : weekDays[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
      ' – ' + weekDays[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  return (
    <div className="section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="section-label" style={{ marginBottom: 0 }}>{weekLabel}</div>
        <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
          <button
            onClick={onWeekBack}
            style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px 10px', fontFamily: 'var(--font)' }}
          >
            ‹
          </button>
          <button
            onClick={onWeekForward}
            disabled={weekOffset >= 0}
            style={{ background: 'none', border: 'none', fontSize: 20, color: weekOffset >= 0 ? 'var(--text-tertiary)' : 'var(--text-secondary)', cursor: weekOffset >= 0 ? 'default' : 'pointer', padding: '2px 10px', fontFamily: 'var(--font)' }}
          >
            ›
          </button>
        </div>
      </div>

      <div className="profile-card">
        {weekDays.map((day, i) => {
          const dayStr = toDateStr(day)
          const dayActivities = byDate[dayStr] || []
          const isCompleted = dayActivities.length > 0
          const session = plan?.[i] ?? null
          const isExpanded = expandedDay === dayStr
          const isToday = dayStr === todayStr
          const dayLong = day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
          const isInteractive = isCompleted || !!session

          let rowContent = null
          if (isCompleted) {
            const a = dayActivities[0]
            const meta = activityMeta(a)
            const tss = estimateTSS(a, ftp)
            rowContent = (
              <>
                <span style={{ fontSize: 16 }}>{meta.emoji}</span>
                <span style={{ fontSize: 14, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {meta.label}{dayActivities.length > 1 ? ` +${dayActivities.length - 1}` : ''}
                </span>
                {tss && <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>TSS {tss}</span>}
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>{formatDuration(a.moving_time)}</span>
                <span style={{ fontSize: 14, color: 'var(--green)', fontWeight: 700, flexShrink: 0, marginLeft: 2 }}>✓</span>
              </>
            )
          } else if (session) {
            rowContent = (
              <>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: INTENSITY_COLOR[session.intensity] ?? 'var(--primary)', flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.label}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>{session.duration}min</span>
              </>
            )
          } else {
            rowContent = <span style={{ fontSize: 14, color: 'var(--text-tertiary)', flex: 1 }}>Rest</span>
          }

          return (
            <div key={dayStr}>
              <div
                className="profile-row"
                style={{ gap: 8, cursor: isInteractive ? 'pointer' : 'default', background: isToday ? 'rgba(0,122,255,0.04)' : 'transparent' }}
                onClick={() => isInteractive && setExpandedDay(isExpanded ? null : dayStr)}
              >
                <span style={{ fontSize: 13, fontWeight: isToday ? 700 : 600, color: isToday ? 'var(--primary)' : 'var(--text-secondary)', width: 72, flexShrink: 0 }}>
                  {dayLong}
                </span>
                {rowContent}
                {isInteractive && (
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                )}
              </div>

              {isExpanded && isCompleted && (
                <div style={{ padding: '4px 16px 14px', borderTop: '1px solid var(--separator)' }}>
                  {dayActivities.map(a => {
                    const meta = activityMeta(a)
                    const np = a.weighted_average_watts ? Math.round(a.weighted_average_watts) : null
                    const tss = estimateTSS(a, ftp)
                    // Strava list endpoint returns kilojoules; calories may also be present.
                    // In cycling, kJ of mechanical work ≈ kcal burned (25% efficiency), so kJ ≈ kcal.
                    const cals = a.calories
                      ? Math.round(a.calories)
                      : a.kilojoules
                      ? Math.round(a.kilojoules)
                      : null
                    const hr = a.average_heartrate ? Math.round(a.average_heartrate) : null
                    const peakHr = a.max_heartrate ? Math.round(a.max_heartrate) : null
                    const zone = hr && peakHr ? hrZone(hr, peakHr) : null
                    return (
                      <div key={a.id} style={{ paddingTop: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <div className={`activity-icon ${meta.cls}`}>{meta.emoji}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 600 }}>{meta.label}</div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                              {formatDuration(a.moving_time)}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '8px 10px' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>NP</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: np ? 'var(--text)' : 'var(--text-tertiary)' }}>
                              {np ? <>{np}<span style={{ fontSize: 11, color: 'var(--text-secondary)' }}> W</span></> : '—'}
                            </div>
                          </div>
                          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '8px 10px' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>TSS</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: tss ? 'var(--text)' : 'var(--text-tertiary)' }}>
                              {tss ?? '—'}
                            </div>
                          </div>
                          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '8px 10px' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>Cal</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: cals ? 'var(--text)' : 'var(--text-tertiary)' }}>
                              {cals ?? '—'}
                            </div>
                          </div>
                        </div>
                        {hr && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 6 }}>
                            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '8px 10px' }}>
                              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>Avg HR</div>
                              <div style={{ fontSize: 16, fontWeight: 700 }}>{hr}<span style={{ fontSize: 11, color: 'var(--text-secondary)' }}> bpm</span></div>
                            </div>
                            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '8px 10px' }}>
                              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>Avg Zone</div>
                              <div style={{ fontSize: 16, fontWeight: 700, color: zone ? 'var(--text)' : 'var(--text-tertiary)' }}>
                                {zone ?? '—'}
                              </div>
                            </div>
                            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '8px 10px' }}>
                              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>Peak HR</div>
                              <div style={{ fontSize: 16, fontWeight: 700, color: peakHr ? 'var(--text)' : 'var(--text-tertiary)' }}>
                                {peakHr ? <>{peakHr}<span style={{ fontSize: 11, color: 'var(--text-secondary)' }}> bpm</span></> : '—'}
                              </div>
                            </div>
                          </div>
                        )}
                        <FeelingSelector activityId={a.id} />
                      </div>
                    )
                  })}
                </div>
              )}

              {isExpanded && !isCompleted && session && (
                <div style={{ padding: '4px 16px 12px', borderTop: '1px solid var(--separator)' }}>
                  <PlannedSessionCard session={session} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Dashboard({ session, onMetricsUpdate }) {
  const athlete = session?.athlete
  const todayStr = toDateStr(new Date())

  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [ftpResult, setFtpResult] = useState(null)
  const [weight, setWeight] = useState(null)
  const [weightLoading, setWeightLoading] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState(todayStr)
  const [rpeRatings, setRpeRatings] = useState(getRpeRatings())
  const [expandedRpe, setExpandedRpe] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackError, setFeedbackError] = useState(null)

  const weekDays = getWeekDays(weekOffset)
  const byDate = groupByDate(activities)
  const ftp = ftpResult?.ftp ?? null
  const wkg = ftp && weight ? Math.round((ftp / weight) * 100) / 100 : null

  useEffect(() => {
    const manual = getManualWeight()
    if (manual) { setWeight(manual); onMetricsUpdate?.({ weight: manual }) }
    const ws = getWithingsSession()
    if (!ws?.access_token) return
    setWeightLoading(true)
    fetchLatestWeight(ws.access_token)
      .then(w => { if (w !== null) { setWeight(w); onMetricsUpdate?.({ weight: w }) } })
      .catch(() => {})
      .finally(() => setWeightLoading(false))
  }, [])

  useEffect(() => {
    if (!session?.access_token) { setLoading(false); return }
    fetchActivities(session.access_token, 200)
      .then(async data => {
        setActivities(data)
        const result = detectFTP(data)
        if (result) {
          setFtpResult(result)
          onMetricsUpdate?.({ ftp: result.ftp })
          if (athlete) {
            saveMetricSnapshot(athlete.id, {
              ftp: result.ftp, weight,
              ftpSource: String(result.sourceActivity?.id),
            })
          }
        }
        setLoading(false)
      })
      .catch(() => { setError('Could not load Strava activities.'); setLoading(false) })
  }, [session])

  useEffect(() => {
    if (loading || weightLoading || !athlete || activities.length === 0) return

    const cached = getCachedFeedback(athlete.id)
    if (cached) { setFeedback(cached); return }

    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

    const recent = activities
      .filter(a => new Date(a.start_date_local) >= fourteenDaysAgo)
      .slice(0, 20)
      .map(a => ({
        date: a.start_date_local?.slice(0, 10),
        type: activityMeta(a).label,
        duration: formatDuration(a.moving_time),
        np: a.weighted_average_watts ? Math.round(a.weighted_average_watts) : null,
        tss: estimateTSS(a, ftp),
      }))

    function weekSummaryFor(days) {
      const byDateLocal = groupByDate(activities)
      const sessions = days.filter(d => byDateLocal[toDateStr(d)]?.length).length
      const tss = days.reduce((sum, d) => {
        const acts = byDateLocal[toDateStr(d)] || []
        return sum + acts.reduce((s, a) => s + (estimateTSS(a, ftp) || 0), 0)
      }, 0)
      return { sessions, tss: Math.round(tss) }
    }

    const weekSummary = {
      thisWeek: weekSummaryFor(getWeekDays(0)),
      lastWeek: weekSummaryFor(getWeekDays(-1)),
    }

    const currentGoal = loadGoal(athlete.id)

    let profile = null
    try {
      const raw = localStorage.getItem(`onboarding_profile_${athlete.id}`)
      if (raw) profile = JSON.parse(raw)
    } catch {}

    setFeedbackLoading(true)
    generateFeedback({ ftp, weight, wkg, goal: currentGoal, recentActivities: recent, weekSummary, profile })
      .then(text => {
        setFeedback(text)
        cacheFeedback(athlete.id, text)
      })
      .catch(err => setFeedbackError(err.message))
      .finally(() => setFeedbackLoading(false))
  }, [loading, weightLoading, athlete?.id, activities.length])

  const goal = loadGoal(athlete?.id)

  function handleWeekBack() {
    const next = weekOffset - 1
    setWeekOffset(next)
    setSelectedDay(toDateStr(getWeekDays(next)[0]))
  }

  function handleWeekForward() {
    if (weekOffset >= 0) return
    const next = weekOffset + 1
    setWeekOffset(next)
    setSelectedDay(next === 0 ? todayStr : toDateStr(getWeekDays(next)[0]))
  }

  function handleRpeSave(activityId, rpe) {
    setRpeRatings(prev => ({ ...prev, [String(activityId)]: rpe }))
    setExpandedRpe(null)
  }

  return (
    <div className="shell">
      <div className="status-bar">
        <span>Training</span>
        <span>{new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      <div className="header">
        <div className="header-title">Your week.</div>
      </div>

      <div className="scroll-area">

        {/* Claude feedback */}
        {(feedback || feedbackLoading || feedbackError) && (
          <div className="section">
            {feedbackLoading && (
              <div className="feedback-card">
                <div className="feedback-meta" style={{ color: 'var(--text-tertiary)' }}>Claude · generating…</div>
                <p className="feedback-text" style={{ color: 'var(--text-secondary)' }}>Reading your last two weeks…</p>
              </div>
            )}
            {feedbackError && !feedbackLoading && (
              <div className="feedback-card">
                <div className="feedback-meta" style={{ color: 'var(--red)' }}>Claude · error</div>
                <p className="feedback-text" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{feedbackError}</p>
              </div>
            )}
            {feedback && !feedbackLoading && (
              <div className="feedback-card">
                <div className="feedback-meta">Claude · Today</div>
                <p className="feedback-text">{feedback}</p>
              </div>
            )}
          </div>
        )}

        {/* Goal progress bar */}
        <GoalProgressBar goal={goal} currentFtp={ftp} />

        {/* Week plan checklist */}
        <WeekPlanSection
          athleteId={athlete?.id}
          weekDays={weekDays}
          byDate={byDate}
          weekOffset={weekOffset}
          onWeekBack={handleWeekBack}
          onWeekForward={handleWeekForward}
          ftp={ftp}
        />

      </div>
    </div>
  )
}

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

// ISO week number (1-53)
function getISOWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
}

// Consecutive days with at least one activity, counting back from today
function calcStreak(byDate) {
  let streak = 0
  const d = new Date()
  // If today has no activity yet, start from yesterday
  if (!byDate[toDateStr(d)]?.length) d.setDate(d.getDate() - 1)
  while (byDate[toDateStr(d)]?.length) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

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
      targetDate: p.targetDate || null,
      startFtp: p.currentFtp ? parseFloat(p.currentFtp) : null,
    }
  } catch { return null }
}

function formatGoalDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
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
          <div className="planned-session-meta">{session.duration} min · planned</div>
        </div>
      </div>

      {session.workout && (
        <div className="mywhoosh-card">
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

// ── Week plan section ────────────────────────────────────────────────────────

const PLAN_DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const INTENSITY_COLOR = {
  easy:     'var(--green)',
  moderate: 'var(--orange)',
  hard:     'var(--red)',
}

function WeekPlanSection({ athleteId, weekDays, byDate }) {
  const plan = athleteId ? loadPlan(athleteId) : null
  if (!plan || plan.every(s => s === null)) return null

  return (
    <div className="section">
      <div className="section-label">This week's plan</div>
      <div className="profile-card" style={{ gap: 0 }}>
        {weekDays.map((day, i) => {
          const session = plan[i]
          const dayStr = toDateStr(day)
          const done = !!(byDate[dayStr]?.length)

          return (
            <div key={dayStr} className="profile-row" style={{ gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', width: 28, flexShrink: 0 }}>
                {PLAN_DAY_NAMES[i]}
              </span>

              {session ? (
                <>
                  <span
                    style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: done ? 'var(--text-tertiary)' : INTENSITY_COLOR[session.intensity] ?? 'var(--primary)',
                    }}
                  />
                  <span style={{ flex: 1, fontSize: 14, color: done ? 'var(--text-tertiary)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>
                    {session.label}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>
                    {done ? '✓' : `${session.duration}min`}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 14, color: 'var(--text-tertiary)', flex: 1 }}>Rest</span>
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

  // Load weight (for wkg and Claude context — no UI here, editing lives in Stats)
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

  // Load Strava activities
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

  // Generate Claude feedback once Strava and Withings have both finished loading
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
  const dayActivities = byDate[selectedDay] || []
  const selectedDate = new Date(selectedDay + 'T12:00:00')
  const plannedSession = athlete ? getPlanForDate(athlete.id, selectedDate) : null
  const streak = calcStreak(byDate)
  const weekNum = getISOWeek(weekDays[0])

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

  const dayLabel = selectedDay === todayStr
    ? 'Today'
    : new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  function handleRpeSave(activityId, rpe) {
    setRpeRatings(prev => ({ ...prev, [String(activityId)]: rpe }))
    setExpandedRpe(null)
  }

  // Prev/next week numbers for the footer
  const prevWeekNum = getISOWeek(getWeekDays(weekOffset - 1)[0])
  const nextWeekNum = weekOffset < 0 ? getISOWeek(getWeekDays(weekOffset + 1)[0]) : null
  const weekRangeLabel = `${weekDays[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${weekDays[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`

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

        {/* ── 1. Claude analysis ── */}
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

        {/* ── 2. Week card ── */}
        <div className="section">
          <div className="week-card">

            <div className="week-card-header">
              <span className="week-card-title">
                {weekOffset === 0 ? 'This week' : `Week ${weekNum}`}
              </span>
              {weekOffset === 0 && streak > 0 && (
                <span className="streak-badge">🔥 {streak}</span>
              )}
            </div>

            <div className="week-days">
              {weekDays.map((day, i) => {
                const dayStr = toDateStr(day)
                const isSelected = dayStr === selectedDay
                const isToday = dayStr === todayStr
                const hasActivity = !!(byDate[dayStr]?.length)
                return (
                  <button
                    key={dayStr}
                    className={`day-cell${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}`}
                    onClick={() => setSelectedDay(dayStr)}
                  >
                    <span className="day-label">{DAY_LABELS[i]}</span>
                    <span className="day-num">{day.getDate()}</span>
                    <span className={`day-dot${hasActivity ? ' has-activity' : ''}`} />
                  </button>
                )
              })}
            </div>

            <div className="week-card-footer">
              <button className="week-footer-btn" onClick={handleWeekBack}>
                ‹ Wk {prevWeekNum}
              </button>
              <span className="week-footer-label">
                {weekOffset === 0 ? `Week ${weekNum}` : weekRangeLabel}
              </span>
              <button
                className="week-footer-btn"
                onClick={handleWeekForward}
                style={{ opacity: weekOffset >= 0 ? 0.2 : 1, pointerEvents: weekOffset >= 0 ? 'none' : 'auto' }}
              >
                Wk {nextWeekNum ?? weekNum + 1} ›
              </button>
            </div>

          </div>
        </div>

        {/* ── 3. Week plan ── */}
        <WeekPlanSection athleteId={athlete?.id} weekDays={weekDays} byDate={byDate} />

        {/* ── 4. Goal progress ── */}
        <div className="section">
          <div className="section-label">Goal</div>
          {!goal ? (
            <div className="goal-card" style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14, padding: '20px 0' }}>
              Complete onboarding to set a goal.
            </div>
          ) : goal.type === 'ftp' ? (
            (() => {
              const pct = (goal.startFtp && goal.ftpTarget && ftp)
                ? Math.min(100, Math.max(0, Math.round(((ftp - goal.startFtp) / (goal.ftpTarget - goal.startFtp)) * 100)))
                : 0
              return (
                <div className="goal-card">
                  <div className="goal-header">
                    <div>
                      <div className="goal-title">FTP {goal.ftpTarget}W</div>
                      {goal.targetDate && <div className="goal-date">By {formatGoalDate(goal.targetDate)}</div>}
                    </div>
                    <div className="goal-badge">{pct}% there</div>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="progress-labels">
                    {goal.startFtp
                      ? <span>Started at <strong>{goal.startFtp}W</strong></span>
                      : <span style={{ color: 'var(--text-tertiary)' }}>Start FTP not recorded</span>
                    }
                    <span>Target <strong>{goal.ftpTarget}W</strong></span>
                  </div>
                </div>
              )
            })()
          ) : (
            <div className="goal-card">
              <div className="goal-header">
                <div>
                  <div className="goal-title">Ride {goal.distanceTarget}km</div>
                  {goal.targetDate && <div className="goal-date">By {formatGoalDate(goal.targetDate)}</div>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 5. Day activity ── */}
        <div className="section">
          <div className="section-label">{dayLabel}</div>

          {loading && (
            <div className="state-message">Loading from Strava…</div>
          )}

          {!loading && error && (
            <div className="state-message" style={{ color: 'var(--red)' }}>{error}</div>
          )}

          {!loading && !error && dayActivities.length === 0 && !plannedSession && (
            <div className="rest-day-card">
              <span className="rest-day-ring" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500 }}>Rest day</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.4 }}>
                  Muscles repair and adapt during recovery. Rest is not optional — it is where the training takes effect.
                </span>
              </div>
            </div>
          )}

          {!loading && !error && dayActivities.length === 0 && plannedSession && (
            <PlannedSessionCard session={plannedSession} />
          )}

          {!loading && dayActivities.length > 0 && (
            <>
              <div className="activity-list">
                {dayActivities.map(a => {
                  const meta = activityMeta(a)
                  const tss = estimateTSS(a, ftp)
                  const isVirtual = a.trainer || a.sport_type === 'VirtualRide'
                  const isFtpSource = ftpResult?.sourceActivity?.id === a.id
                  const savedRpe = rpeRatings[String(a.id)]
                  const rpeZone = savedRpe ? getRpeZone(savedRpe) : null
                  const isExpanded = expandedRpe === a.id
                  const np = a.weighted_average_watts ? Math.round(a.weighted_average_watts) : null
                  const npUnit = 'W NP'
                  return (
                    <div key={a.id}>
                      <div
                        className="activity-row"
                        style={isFtpSource ? { background: '#F0F6FF' } : {}}
                        onClick={() => setExpandedRpe(isExpanded ? null : a.id)}
                      >
                        <div className={`activity-icon ${meta.cls}`}>{meta.emoji}</div>
                        <div className="activity-info">
                          <div className="activity-name">
                            {meta.label}
                            {isVirtual && <span className="virtual-badge">Virtual</span>}
                            {isFtpSource && <span className="virtual-badge" style={{ background: '#E3F2FD', color: 'var(--primary)' }}>FTP source</span>}
                            {savedRpe && (
                              <span className="rpe-badge" style={{ background: rpeZone?.color }}>
                                RPE {savedRpe}
                              </span>
                            )}
                          </div>
                          <div className="activity-meta">
                            {formatDuration(a.moving_time)}
                            {np ? ` · ${np} ${npUnit}` : ''}
                            {a.average_heartrate ? ` · ${Math.round(a.average_heartrate)} bpm` : ''}
                            {a.calories ? ` · ${Math.round(a.calories)} cal` : ''}
                          </div>
                        </div>
                        <div className="activity-tss">
                          {tss !== null
                            ? <><div className="tss-value">{tss}</div><div className="tss-label">TSS</div></>
                            : a.suffer_score
                            ? <><div className="tss-value">{a.suffer_score}</div><div className="tss-label">SS</div></>
                            : null}
                        </div>
                      </div>
                      {isExpanded && <RpeRow activityId={a.id} onSave={handleRpeSave} />}
                    </div>
                  )
                })}
              </div>
              {/* Planned session shown alongside completed activities */}
              {plannedSession && <PlannedSessionCard session={plannedSession} />}
            </>
          )}
        </div>


      </div>
    </div>
  )
}

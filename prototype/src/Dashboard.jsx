import { useState, useEffect } from 'react'
import { getRpeZone } from './mockData.js'
import { fetchActivities, formatDuration, activityMeta, estimateTSS } from './strava.js'
import { detectFTP, confidenceLabel, ftpExplanation } from './ftp.js'
import { saveMetricSnapshot } from './auth.js'
import { getWithingsSession, fetchLatestWeight, redirectToWithings, getManualWeight, setManualWeight } from './withings.js'
import { getPlanForDate } from './plan.js'
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

// ── Context sentence ─────────────────────────────────────────────────────────
// Rule-based one-liner at the top of the feed. Only shown for today.

function buildContextSentence({ byDate, goal, ftp, plannedSession, todayStr }) {
  const parts = []

  // Yesterday's load
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yActs = byDate[toDateStr(yesterday)] || []
  const yTss = yActs.reduce((s, a) => s + (estimateTSS(a, ftp) || 0), 0)

  if (yActs.length > 0) {
    if (yTss >= 100)      parts.push('Big day yesterday — legs may need attention.')
    else if (yTss >= 60)  parts.push('Solid session yesterday.')
    else                  parts.push('Easy day yesterday — you should feel fresh.')
  } else {
    parts.push('Rest day yesterday.')
  }

  // Today's plan or goal nudge
  if (plannedSession) {
    parts.push(`${plannedSession.label} on the plan today.`)
  } else if (goal?.type === 'ftp' && goal.ftpTarget && ftp) {
    const gap = goal.ftpTarget - ftp
    if (gap <= 0)       parts.push("You've hit your FTP target.")
    else if (gap <= 10) parts.push(`${gap}W from your goal — almost there.`)
    else                parts.push(`${gap}W to go on your FTP goal.`)
  }

  // Week sessions so far
  const weekDays = getWeekDays(0)
  const doneThisWeek = weekDays.filter(d => byDate[toDateStr(d)]?.length).length
  const remainingDays = weekDays.filter(d => toDateStr(d) > todayStr).length
  if (doneThisWeek > 0 && remainingDays > 0) {
    parts.push(`${doneThisWeek} session${doneThisWeek > 1 ? 's' : ''} done this week, ${remainingDays} day${remainingDays > 1 ? 's' : ''} to go.`)
  }

  return parts.slice(0, 2).join(' ')
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

// ── Power unit helpers ───────────────────────────────────────────────────────

function getPowerUnit() { return localStorage.getItem('power_unit') || 'W' }
function setPowerUnit(unit) { localStorage.setItem('power_unit', unit) }

// ── FTP Tooltip panel ────────────────────────────────────────────────────────

function FtpTooltip({ ftpResult, onClose }) {
  const exp = ftpExplanation(ftpResult)
  if (!exp) return null
  return (
    <>
      <div className="tooltip-backdrop" onClick={onClose} />
      <div className="tooltip-sheet">
        <div className="debug-handle" />
        <div className="tooltip-title">How your FTP was calculated</div>
        <div className="tooltip-rows">
          <div className="tooltip-row">
            <span className="tooltip-key">Activity</span>
            <span className="tooltip-val">{exp.activityName}</span>
          </div>
          {exp.activityDate && (
            <div className="tooltip-row">
              <span className="tooltip-key">Date</span>
              <span className="tooltip-val">{exp.activityDate}</span>
            </div>
          )}
          <div className="tooltip-row">
            <span className="tooltip-key">Method</span>
            <span className="tooltip-val">{exp.method}</span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-key">Confidence</span>
            <span className="tooltip-val">{exp.confidenceLabel}</span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-key">Formula</span>
            <span className="tooltip-val tooltip-formula">{exp.formula}</span>
          </div>
        </div>
        <button className="debug-close" onClick={onClose}>Got it</button>
      </div>
    </>
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

// ── Component ────────────────────────────────────────────────────────────────

export default function Dashboard({ session, onMetricsUpdate }) {
  const athlete = session?.athlete
  const todayStr = toDateStr(new Date())

  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [ftpResult, setFtpResult] = useState(null)
  const [weight, setWeight] = useState(null)
  const [weightSource, setWeightSource] = useState(null)
  const [weightLoading, setWeightLoading] = useState(false)
  const [editingWeight, setEditingWeight] = useState(false)
  const [weightInput, setWeightInput] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState(todayStr)

  const [showFtpTooltip, setShowFtpTooltip] = useState(false)
  const [powerUnit, setPowerUnitState] = useState(getPowerUnit())
  const [rpeRatings, setRpeRatings] = useState(getRpeRatings())
  const [expandedRpe, setExpandedRpe] = useState(null)

  const [feedback, setFeedback] = useState(null)
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackError, setFeedbackError] = useState(null)

  const weekDays = getWeekDays(weekOffset)
  const byDate = groupByDate(activities)

  const ftp = ftpResult?.ftp ?? null
  const wkg = ftp && weight ? Math.round((ftp / weight) * 100) / 100 : null
  const displayFtp = ftp ? (powerUnit === 'wkg' && weight ? Math.round((ftp / weight) * 100) / 100 : ftp) : null
  const displayUnit = powerUnit === 'wkg' ? 'W/kg' : 'W'

  function displayPower(watts) {
    if (!watts) return null
    return powerUnit === 'wkg' && weight ? Math.round((watts / weight) * 100) / 100 : Math.round(watts)
  }

  function togglePowerUnit() {
    const next = powerUnit === 'W' ? 'wkg' : 'W'
    setPowerUnit(next)
    setPowerUnitState(next)
  }

  // Load weight
  useEffect(() => {
    const manual = getManualWeight()
    if (manual) { setWeight(manual); setWeightSource('manual'); onMetricsUpdate?.({ weight: manual }) }

    const ws = getWithingsSession()
    if (!ws?.access_token) return
    setWeightLoading(true)
    fetchLatestWeight(ws.access_token)
      .then(w => {
        if (w !== null) { setWeight(w); setWeightSource('withings'); onMetricsUpdate?.({ weight: w }) }
      })
      .catch(e => console.error('Withings weight fetch failed:', e))
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

  // Context sentence (only for today)
  const contextSentence = selectedDay === todayStr
    ? buildContextSentence({ byDate, goal, ftp, plannedSession, todayStr })
    : null

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
      {showFtpTooltip && ftpResult && (
        <FtpTooltip ftpResult={ftpResult} onClose={() => setShowFtpTooltip(false)} />
      )}

      <div className="status-bar">
        <span>Training</span>
        <span>{new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      <div className="header">
        <div className="header-title">Your week.</div>
      </div>

      <div className="scroll-area">

        {/* ── 1. Context sentence ── */}
        {contextSentence && (
          <div className="context-sentence">{contextSentence}</div>
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

        {/* ── 3. Goal progress ── */}
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

        {/* ── 4. Day activity ── */}
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
              <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Rest day</span>
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
                  const np = displayPower(a.weighted_average_watts)
                  const npUnit = powerUnit === 'wkg' && weight ? 'W/kg NP' : 'W NP'
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

        {/* ── 5. Your numbers (secondary reference) ── */}
        <div className="section">
          <div className="section-label-row">
            <span className="section-label" style={{ marginBottom: 0 }}>Your numbers</span>
            {weight && (
              <button className="power-toggle" onClick={togglePowerUnit}>
                {powerUnit === 'W' ? 'W' : 'W/kg'}
              </button>
            )}
          </div>
          <div className="metrics-grid" style={{ marginTop: 12 }}>

            <div className="metric-card">
              <div className="metric-label-row">
                <span className="metric-label">FTP</span>
                {ftpResult && <button className="info-btn" onClick={() => setShowFtpTooltip(true)}>ⓘ</button>}
              </div>
              <div className="metric-value" style={{ fontSize: displayFtp ? undefined : 22, color: displayFtp ? 'var(--text)' : 'var(--text-tertiary)' }}>
                {displayFtp ? <>{displayFtp}<span className="metric-unit">{displayUnit}</span></> : '—'}
              </div>
              <div className="metric-footer">
                <span style={{ fontSize: 11 }}>
                  {ftpResult ? confidenceLabel(ftpResult.confidence) : 'No qualifying ride yet'}
                </span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label">W/kg</div>
              <div className="metric-value">{wkg !== null ? wkg : '—'}</div>
              <div className="metric-footer">
                <span style={{ fontSize: 11 }}>{weight ? `at ${weight}kg` : 'needs weight'}</span>
              </div>
            </div>

            <div className="metric-card wide">
              <div className="metric-label">Weight</div>
              {weight !== null && !editingWeight ? (
                <>
                  <div className="metric-value">{weight}<span className="metric-unit">kg</span></div>
                  <div className="metric-footer" style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11 }}>{weightSource === 'withings' ? 'Withings' : 'Manual'}</span>
                    <button onClick={() => { setWeightInput(String(weight)); setEditingWeight(true) }}
                      style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Update
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="metric-value" style={{ fontSize: weightLoading ? 16 : 34, color: 'var(--text-secondary)' }}>
                    {weightLoading ? 'Loading…' : '—'}
                  </div>
                  {!weightLoading && (
                    <>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button onClick={redirectToWithings} className="weight-source-btn">Withings</button>
                        <button disabled className="weight-source-btn" style={{ opacity: 0.35 }}>InBody</button>
                      </div>
                      {editingWeight ? (
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <input type="number" inputMode="decimal" value={weightInput}
                            onChange={e => setWeightInput(e.target.value)} placeholder="74.5" autoFocus
                            style={{ flex: 1, background: 'var(--bg)', border: 'none', borderRadius: 8, padding: '8px 10px', fontSize: 15, fontFamily: 'var(--font)', outline: 'none' }} />
                          <button onClick={() => {
                            const v = parseFloat(weightInput)
                            if (v > 0) { setManualWeight(v); setWeight(v); setWeightSource('manual'); onMetricsUpdate?.({ weight: v }) }
                            setEditingWeight(false)
                          }} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                            Save
                          </button>
                          <button onClick={() => setEditingWeight(false)}
                            style={{ background: 'var(--bg)', border: 'none', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setEditingWeight(true)}
                          style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
                          enter manually
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

          </div>
        </div>

        {/* ── Latest read ── */}
        {(feedback || feedbackLoading || feedbackError) && (
          <div className="section">
            <div className="section-label">Latest read</div>
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

      </div>
    </div>
  )
}

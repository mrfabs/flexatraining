import { useState, useEffect } from 'react'
import { fetchActivities } from './strava.js'
import { detectFTP, detectPowerBreakdown } from './ftp.js'
import { getWithingsSession, fetchLatestWeight, redirectToWithings, getManualWeight, setManualWeight } from './withings.js'
import { saveMetricSnapshot } from './auth.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function detectFtpTrend(activities) {
  const now = Date.now()
  const WEEK = 7 * 86400000
  const recent = activities.filter(a =>
    new Date(a.start_date || a.start_date_local).getTime() >= now - 4 * WEEK
  )
  const previous = activities.filter(a => {
    const t = new Date(a.start_date || a.start_date_local).getTime()
    return t >= now - 8 * WEEK && t < now - 4 * WEEK
  })
  const recentFtp = detectFTP(recent)?.ftp
  const prevFtp = detectFTP(previous)?.ftp
  if (!recentFtp || !prevFtp) return null
  const diff = recentFtp - prevFtp
  if (diff > 3) return { label: `↑ Up ${diff}W`, color: 'var(--green)', diff }
  if (diff < -3) return { label: '→ Similar to last month', color: 'var(--text-secondary)', diff }
  return { label: '→ Holding steady', color: 'var(--text-secondary)', diff: 0 }
}

function wkgContext(wkg) {
  if (!wkg) return null
  if (wkg < 2.0) return 'Building base'
  if (wkg < 2.5) return 'Recreational rider'
  if (wkg < 3.0) return 'Active club rider'
  if (wkg < 3.5) return 'Competitive club rider'
  if (wkg < 4.0) return 'Sportive-competitive'
  if (wkg < 4.5) return 'Category racer territory'
  return 'Elite territory'
}

function breakdownOrder(goalType) {
  if (goalType === 'ftp' || goalType === 'granfondo') return ['climb', 'attack', 'sprint']
  if (goalType === 'power') return ['attack', 'climb', 'sprint']
  return ['sprint', 'attack', 'climb']
}

// ── Weight history ────────────────────────────────────────────────────────────

function saveWeightHistory(value) {
  const today = new Date().toISOString().split('T')[0]
  let history = []
  try { history = JSON.parse(localStorage.getItem('weight_history') || '[]') } catch {}
  history = history.filter(h => h.date !== today)
  history.push({ value, date: today })
  if (history.length > 60) history = history.slice(-60)
  localStorage.setItem('weight_history', JSON.stringify(history))
}

function detectWeightTrend(currentWeight) {
  try {
    const history = JSON.parse(localStorage.getItem('weight_history') || '[]')
    if (history.length < 2) return null
    const thirtyDaysAgo = Date.now() - 30 * 86400000
    const older = history.filter(h => new Date(h.date + 'T12:00:00').getTime() < thirtyDaysAgo)
    if (!older.length) return null
    const prev = older[older.length - 1].value
    const diff = currentWeight - prev
    if (Math.abs(diff) < 0.5) return { label: '→ Stable', color: 'var(--text-secondary)' }
    if (diff < 0) return { label: `↓ ${Math.abs(diff).toFixed(1)}kg down`, color: 'var(--green)' }
    return { label: `↑ ${diff.toFixed(1)}kg up`, color: 'var(--text-secondary)' }
  } catch { return null }
}

// ── Goal progress chart ───────────────────────────────────────────────────────

function GoalProgressChart({ goal, currentFtp }) {
  if (!goal) {
    return (
      <div className="section">
        <div className="profile-card" style={{ padding: '20px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
            Complete onboarding to see your goal progress.
          </p>
        </div>
      </div>
    )
  }

  if (goal.type !== 'ftp' || !goal.ftpTarget || !goal.targetDate) {
    return (
      <div className="section">
        <div className="profile-card" style={{ padding: '20px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
            Goal progress chart coming for this goal type.
          </p>
        </div>
      </div>
    )
  }

  const startFtp = goal.startFtp || null
  const targetFtp = goal.ftpTarget
  const today = new Date()

  const startDate = goal.goalStartDate
    ? new Date(goal.goalStartDate + 'T12:00:00')
    : goal.onboardedAt
    ? new Date(goal.onboardedAt + 'T12:00:00')
    : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d })()
  const endDate = new Date(goal.targetDate + 'T12:00:00')

  const totalMs = Math.max(1, endDate - startDate)
  const elapsedMs = today - startDate
  const progressRatio = Math.max(0, Math.min(1, elapsedMs / totalMs))
  const elapsedDays = elapsedMs / 86400000
  const remainingDays = (endDate - today) / 86400000

  // Determine the actual "start FTP" for the chart origin.
  // If user entered their current FTP at onboarding, use that.
  // If not, fall back to currentFtp (which means start = now, no history shown).
  const chartStartFtp = startFtp || currentFtp || 200
  const chartCurrentFtp = currentFtp || chartStartFtp

  let projectedEndFtp = targetFtp
  if (currentFtp && startFtp && elapsedDays > 1 && remainingDays > 0) {
    const dailyRate = (currentFtp - startFtp) / elapsedDays
    projectedEndFtp = Math.round(currentFtp + dailyRate * remainingDays)
  }

  const isOnTrack = projectedEndFtp >= targetFtp
  const goalMet = currentFtp && currentFtp >= targetFtp
  const projColor = isOnTrack ? 'var(--green)' : 'var(--primary)'

  const W = 320, H = 156
  const PL = 44, PR = 14, PT = 16, PB = 26
  const cW = W - PL - PR
  const cH = H - PT - PB

  const allVals = [chartStartFtp, targetFtp, chartCurrentFtp, projectedEndFtp].filter(Boolean)
  const pad = Math.max(8, (targetFtp - chartStartFtp) * 0.12)
  const minVal = Math.min(...allVals) - pad
  const maxVal = Math.max(...allVals) + pad
  const vRange = Math.max(1, maxVal - minVal)

  const xP = (date) => PL + Math.max(0, Math.min(1, (date - startDate) / totalMs)) * cW
  const yP = (val) => PT + cH - ((val - minVal) / vRange) * cH

  const x0 = PL, xEnd = PL + cW, xToday = xP(today)
  const y0 = yP(chartStartFtp), yTarget = yP(targetFtp)
  const yCurrent = yP(chartCurrentFtp)
  const yProjEnd = yP(projectedEndFtp)

  const fmtShort = (d) => d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
  const fmtFull = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const gained = currentFtp && startFtp ? currentFtp - startFtp : 0

  return (
    <div className="section">
      <div className="profile-card" style={{ overflow: 'hidden', padding: 0 }}>

        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
          {[0.33, 0.66].map(r => (
            <line key={r} x1={PL} x2={PL + cW} y1={PT + cH * (1 - r)} y2={PT + cH * (1 - r)}
              stroke="var(--separator)" strokeWidth={0.5} />
          ))}
          {/* Target line (dashed) */}
          <line x1={x0} y1={y0} x2={xEnd} y2={yTarget}
            stroke="var(--border)" strokeWidth={1.5} strokeDasharray="5 4" />
          {/* Actual progress line */}
          {progressRatio > 0 && (
            <line x1={x0} y1={y0} x2={xToday} y2={yCurrent}
              stroke="var(--primary)" strokeWidth={2.5} strokeLinecap="round" />
          )}
          {/* Projection line */}
          {progressRatio < 1 && remainingDays > 0 && (
            <line x1={xToday} y1={yCurrent} x2={xEnd} y2={yProjEnd}
              stroke={projColor} strokeWidth={1.5} strokeDasharray="4 3" strokeLinecap="round" opacity={0.65} />
          )}
          <circle cx={x0} cy={y0} r={3} fill="var(--text-tertiary)" />
          <circle cx={xEnd} cy={yTarget} r={4} fill="var(--text-secondary)" />
          {progressRatio > 0 && <circle cx={xToday} cy={yCurrent} r={5} fill="var(--primary)" />}
          {progressRatio < 1 && remainingDays > 0 && (
            <circle cx={xEnd} cy={yProjEnd} r={3} fill={projColor} opacity={0.65} />
          )}
          {/* Today vertical line */}
          {progressRatio > 0 && progressRatio < 1 && (
            <line x1={xToday} y1={PT} x2={xToday} y2={PT + cH}
              stroke="var(--primary)" strokeWidth={0.75} strokeDasharray="3 3" opacity={0.3} />
          )}
          <text x={PL - 6} y={y0 + 4} fontSize={10} fill="var(--text-tertiary)" textAnchor="end">{chartStartFtp}W</text>
          <text x={PL - 6} y={yTarget + 4} fontSize={10} fill="var(--text-secondary)" textAnchor="end">{targetFtp}W</text>
          <text x={x0} y={H - 4} fontSize={9} fill="var(--text-tertiary)" textAnchor="start">{fmtShort(startDate)}</text>
          <text x={xEnd} y={H - 4} fontSize={9} fill="var(--text-secondary)" textAnchor="end">{fmtShort(endDate)}</text>
          {progressRatio > 0 && progressRatio < 1 && (
            <text x={xToday} y={H - 4} fontSize={9} fill="var(--primary)" textAnchor="middle">Today</text>
          )}
        </svg>

        <div style={{ display: 'flex', borderTop: '1px solid var(--separator)', padding: '12px 16px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3 }}>Started</div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{chartStartFtp}<span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 2 }}>W</span></div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--primary)', marginBottom: 3 }}>Now</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--primary)' }}>{chartCurrentFtp}<span style={{ fontSize: 11, marginLeft: 2 }}>W</span></div>
          </div>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3 }}>Target</div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{targetFtp}<span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 2 }}>W</span></div>
          </div>
        </div>

        <div style={{ padding: '8px 16px 12px', borderTop: '1px solid var(--separator)' }}>
          {goalMet ? (
            <p style={{ fontSize: 12, color: 'var(--green)', margin: 0 }}>
              Goal reached. Consider setting a new one.
            </p>
          ) : gained > 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
              {isOnTrack
                ? `On track — projecting ${projectedEndFtp}W by ${fmtFull(endDate)}.`
                : `You've added ${gained}W since you started — keep building toward ${fmtFull(endDate)}.`
              }
            </p>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
              Training toward {targetFtp}W by {fmtFull(endDate)}.
            </p>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Power breakdown (read-only) ───────────────────────────────────────────────

function BreakdownSection({ title, rows, weight }) {
  return (
    <div className="breakdown-section">
      <div className="breakdown-title">{title}</div>
      {rows.map(row => {
        const wkg = row.watts && weight ? Math.round((row.watts / weight) * 100) / 100 : null
        return (
          <div key={row.label} className="breakdown-row">
            <span className="breakdown-label">{row.label}</span>
            <div className="breakdown-values">
              {row.watts
                ? <>
                    <span className="breakdown-watts">{row.watts}<span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 2 }}>W</span></span>
                    {weight && <span className="breakdown-wkg">{wkg} <span style={{ fontSize: 11 }}>W/kg</span></span>}
                  </>
                : <span style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>—</span>
              }
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Stats({ session, onMetricsUpdate }) {
  const athlete = session?.athlete

  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [ftpResult, setFtpResult] = useState(null)
  const [weight, setWeight] = useState(null)
  const [weightSource, setWeightSource] = useState(null)
  const [weightLoading, setWeightLoading] = useState(false)
  const [editingWeight, setEditingWeight] = useState(false)
  const [weightInput, setWeightInput] = useState('')
  const [breakdown, setBreakdown] = useState(null)

  const ftp = ftpResult?.ftp ?? null
  const wkg = ftp && weight ? Math.round((ftp / weight) * 100) / 100 : null

  const goal = loadGoal(athlete?.id)
  const trend = activities.length ? detectFtpTrend(activities) : null
  const weightTrend = weight ? detectWeightTrend(weight) : null

  // W/kg trend: derive from FTP trend (same weight assumed)
  const wkgTrend = trend && weight ? (() => {
    if (!ftp) return null
    const prevFtp = ftp - (trend.diff || 0)
    const prevWkg = Math.round((prevFtp / weight) * 100) / 100
    const diff = wkg - prevWkg
    if (diff > 0.02) return { label: `↑ Up ${diff.toFixed(2)}`, color: 'var(--green)' }
    if (diff < -0.02) return { label: '→ Similar to last month', color: 'var(--text-secondary)' }
    return { label: '→ Holding steady', color: 'var(--text-secondary)' }
  })() : null

  const order = breakdownOrder(goal?.type)

  const sourceDate = ftpResult?.sourceActivity?.start_date_local
  const sourceDateLabel = sourceDate
    ? new Date(sourceDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null

  useEffect(() => {
    const manual = getManualWeight()
    if (manual) {
      setWeight(manual); setWeightSource('manual')
      onMetricsUpdate?.({ weight: manual })
      saveWeightHistory(manual)
    }
    const ws = getWithingsSession()
    if (!ws?.access_token) return
    setWeightLoading(true)
    fetchLatestWeight(ws.access_token)
      .then(w => {
        if (w !== null) {
          setWeight(w); setWeightSource('withings')
          onMetricsUpdate?.({ weight: w })
          saveWeightHistory(w)
        }
      })
      .catch(() => {})
      .finally(() => setWeightLoading(false))
  }, [])

  useEffect(() => {
    if (!session?.access_token) { setLoading(false); return }
    fetchActivities(session.access_token, 200)
      .then(data => {
        setActivities(data)
        const result = detectFTP(data)
        if (result) {
          setFtpResult(result)
          onMetricsUpdate?.({ ftp: result.ftp })
          if (athlete) {
            saveMetricSnapshot(athlete.id, { ftp: result.ftp, weight, ftpSource: String(result.sourceActivity?.id) })
          }
        }
        setBreakdown(detectPowerBreakdown(data, result?.ftp ?? null))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [session])

  return (
    <div className="shell">
      <div className="status-bar">
        <span>Stats</span>
        <span>{new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      <div className="header">
        <div className="header-title">Your numbers.</div>
      </div>

      <div className="scroll-area">

        {/* Goal progress chart */}
        <GoalProgressChart goal={goal} currentFtp={ftp} />

        {/* Combined FTP + W/kg + Weight card */}
        <div className="section">
          <div className="profile-card">

            {/* FTP row */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--separator)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>FTP</span>
                {trend && ftp && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: trend.color }}>{trend.label}</span>
                )}
              </div>
              {ftp ? (
                <>
                  <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5, marginTop: 4, lineHeight: 1 }}>
                    {ftp}<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 3 }}>W</span>
                  </div>
                  {sourceDateLabel && (
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      From your ride on {sourceDateLabel}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 16, color: 'var(--text-tertiary)', marginTop: 6 }}>
                  — <span style={{ fontSize: 13 }}>Ride with a power meter to detect</span>
                </div>
              )}
            </div>

            {/* W/kg row */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--separator)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>W/kg</span>
                {wkgTrend && wkg && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: wkgTrend.color }}>{wkgTrend.label}</span>
                )}
              </div>
              {wkg ? (
                <>
                  <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5, marginTop: 4, lineHeight: 1 }}>
                    {wkg}<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 3 }}>W/kg</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{wkgContext(wkg)}</div>
                </>
              ) : (
                <div style={{ fontSize: 16, color: 'var(--text-tertiary)', marginTop: 6 }}>
                  — <span style={{ fontSize: 13 }}>Needs FTP and weight</span>
                </div>
              )}
            </div>

            {/* Weight row */}
            <div style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Weight</span>
                {weightTrend && weight && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: weightTrend.color }}>{weightTrend.label}</span>
                )}
              </div>
              {weight && !editingWeight ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                    <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1 }}>
                      {weight}<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 3 }}>kg</span>
                    </div>
                    {weightSource !== 'withings' && (
                      <button
                        onClick={() => { setWeightInput(String(weight)); setEditingWeight(true) }}
                        style={{ fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Update
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                    {weightSource === 'withings' ? 'Synced from Withings' : 'Manual entry'}
                  </div>
                </>
              ) : weight && editingWeight ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    type="number" inputMode="decimal" value={weightInput}
                    onChange={e => setWeightInput(e.target.value)}
                    placeholder="74.5" autoFocus
                    style={{ flex: 1, background: 'var(--bg)', border: 'none', borderRadius: 8, padding: '8px 10px', fontSize: 15, fontFamily: 'var(--font)', outline: 'none', minWidth: 0 }}
                  />
                  <button onClick={() => {
                    const v = parseFloat(weightInput)
                    if (v > 0) { setManualWeight(v); setWeight(v); setWeightSource('manual'); onMetricsUpdate?.({ weight: v }); saveWeightHistory(v) }
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
                <>
                  <div style={{ fontSize: 16, color: 'var(--text-tertiary)', marginTop: 6 }}>—</div>
                  {!weightLoading && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button onClick={redirectToWithings} className="weight-source-btn">Withings</button>
                      <button onClick={() => setEditingWeight(true)} className="weight-source-btn">Enter manually</button>
                    </div>
                  )}
                  {editingWeight && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input
                        type="number" inputMode="decimal" value={weightInput}
                        onChange={e => setWeightInput(e.target.value)}
                        placeholder="74.5" autoFocus
                        style={{ flex: 1, background: 'var(--bg)', border: 'none', borderRadius: 8, padding: '8px 10px', fontSize: 15, fontFamily: 'var(--font)', outline: 'none', minWidth: 0 }}
                      />
                      <button onClick={() => {
                        const v = parseFloat(weightInput)
                        if (v > 0) { setManualWeight(v); setWeight(v); setWeightSource('manual'); onMetricsUpdate?.({ weight: v }); saveWeightHistory(v) }
                        setEditingWeight(false)
                      }} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                        Save
                      </button>
                      <button onClick={() => setEditingWeight(false)}
                        style={{ background: 'var(--bg)', border: 'none', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                        ✕
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

          </div>
        </div>

        {/* Power breakdown */}
        {loading && (
          <div className="section">
            <div className="state-message">Loading power data…</div>
          </div>
        )}

        {!loading && !breakdown && (
          <div className="section">
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', padding: '0 4px' }}>
              Power breakdown requires rides with a power meter.
            </p>
          </div>
        )}

        {!loading && breakdown && (
          <div className="section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span className="section-label" style={{ marginBottom: 0 }}>Power breakdown</span>
              {sourceDateLabel && (
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Updated {sourceDateLabel}</span>
              )}
            </div>
            {order.map(cat => (
              <BreakdownSection
                key={cat}
                title={cat.charAt(0).toUpperCase() + cat.slice(1)}
                rows={breakdown[cat]}
                weight={weight}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

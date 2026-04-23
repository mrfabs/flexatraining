import { useState, useEffect } from 'react'
import {
  structureOptions,
  consistencyOptions,
  nonNegotiablePresets,
  distanceGoals,
  activityLevelOptions,
  lifeContextOptions,
  supportingActivities,
  coachingOptions,
} from './mockData.js'
import { fetchActivities } from './strava.js'
import { detectFTP, confidenceLabel, detectPowerBreakdown, ftpFromDurationPower } from './ftp.js'
import { getWithingsSession, fetchLatestWeight, redirectToWithings, getManualWeight, setManualWeight } from './withings.js'

// ── Inference helpers ────────────────────────────────────────────────────────

const SPORT_TO_ACTIVITY = {
  Run: 'Running', TrailRun: 'Running', VirtualRun: 'Running',
  Swim: 'Swimming',
  WeightTraining: 'Weight training', Crossfit: 'Weight training', Workout: 'Weight training',
  Yoga: 'Stretching / yoga', Pilates: 'Pilates',
  Rowing: 'Rowing',
  Walk: 'Hiking / walking', Hike: 'Hiking / walking',
  Soccer: 'Football or team sports', Football: 'Football or team sports',
  RockClimbing: 'Rock climbing',
  MartialArts: 'Martial arts / boxing', Boxing: 'Martial arts / boxing',
}

const EIGHT_WEEKS_MS = 56 * 24 * 60 * 60 * 1000

function countActivities8Weeks(activities) {
  const cutoff = new Date(Date.now() - EIGHT_WEEKS_MS)
  return activities.filter(a => new Date(a.start_date_local) >= cutoff).length
}

// Returns 'high' | 'medium' | 'low' based on v3 confidence model
function computeInferenceConfidence(activities) {
  const count = countActivities8Weeks(activities)
  if (count >= 10) return 'high'
  if (count >= 5) return 'medium'
  return 'low'
}

function inferActivityLevel(activities) {
  const cutoff = new Date(Date.now() - EIGHT_WEEKS_MS)
  const recent = activities.filter(a => new Date(a.start_date_local) >= cutoff)
  if (recent.length < 3) return null
  const perWeek = recent.length / 8
  if (perWeek >= 6) return 'high_volume'
  if (perWeek >= 3.5) return 'consistent'
  if (perWeek >= 1.5) return 'expanding'
  return 'returning'
}

function inferDaysPerWeek(activities) {
  const cutoff = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)
  const recent = activities.filter(a => new Date(a.start_date_local) >= cutoff)
  if (recent.length < 2) return null
  return Math.max(1, Math.round(recent.length / 4))
}

function inferTrainingTime(activities) {
  const sample = activities.slice(0, 20)
  if (sample.length < 3) return null
  const c = { Mornings: 0, Lunch: 0, Evenings: 0, other: 0 }
  sample.forEach(a => {
    const h = new Date(a.start_date_local).getHours()
    if (h >= 5 && h < 11) c.Mornings++
    else if (h >= 11 && h < 14) c.Lunch++
    else if (h >= 17 && h < 22) c.Evenings++
    else c.other++
  })
  const total = sample.length
  const max = Math.max(c.Mornings, c.Lunch, c.Evenings)
  if (max / total < 0.4) return 'When it works'
  if (c.Mornings === max) return 'Mornings'
  if (c.Lunch === max) return 'Lunch'
  return 'Evenings'
}

function inferStructure(activities) {
  const sample = activities.slice(0, 24)
  if (sample.length < 6) return null
  const dayCounts = Array(7).fill(0)
  sample.forEach(a => { dayCounts[new Date(a.start_date_local).getDay()]++ })
  const max = Math.max(...dayCounts)
  const regularDays = dayCounts.filter(c => c >= max * 0.5).length
  if (regularDays >= 3) return 'plan_follower'
  if (regularDays >= 2) return 'adapts_week'
  return null
}

function inferSupportingActivities(activities) {
  const found = new Set()
  activities.forEach(a => {
    const mapped = SPORT_TO_ACTIVITY[a.sport_type || a.type]
    if (mapped) found.add(mapped)
  })
  return [...found]
}

function getLongestRide(activities) {
  const RIDE_TYPES = ['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide']
  const rides = activities.filter(a => RIDE_TYPES.includes(a.sport_type || a.type))
  if (!rides.length) return null
  const longest = rides.reduce((max, a) => (a.distance || 0) > (max.distance || 0) ? a : max)
  return {
    km: Math.round((longest.distance || 0) / 1000),
    date: new Date(longest.start_date_local).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
  }
}

// ── Shared components ────────────────────────────────────────────────────────

// Steps 1–11 are the tracked questions; step 0 = numbers, step 12 = done
function ProgressBar({ step }) {
  if (step === 0 || step >= 12) return null
  return (
    <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginBottom: 32, overflow: 'hidden' }}>
      <div style={{
        height: '100%',
        width: `${(step / 11) * 100}%`,
        background: 'var(--primary)',
        borderRadius: 2,
        transition: 'width 0.4s ease',
      }} />
    </div>
  )
}

function Picker({ options, value, onChange, cols = 1 }) {
  const isObj = typeof options[0] === 'object'
  return (
    <div className="picker-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {options.map(opt => {
        const val = isObj ? opt.value : opt
        const label = isObj ? opt.label : opt
        return (
          <button
            key={val}
            className={`picker-option${value === val ? ' selected' : ''}`}
            onClick={() => onChange(val)}
            style={{ textAlign: 'left' }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function MultiSelect({ options, values, onChange }) {
  function toggle(opt) {
    onChange(values.includes(opt) ? values.filter(v => v !== opt) : [...values, opt])
  }
  return (
    <div className="picker-grid" style={{ gridTemplateColumns: '1fr' }}>
      {options.map(opt => (
        <button
          key={opt}
          className={`picker-option${values.includes(opt) ? ' selected' : ''}`}
          onClick={() => toggle(opt)}
          style={{ textAlign: 'left', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10 }}
        >
          <span style={{ opacity: values.includes(opt) ? 1 : 0.3, fontSize: 13 }}>
            {values.includes(opt) ? '✓' : '○'}
          </span>
          {opt}
        </button>
      ))}
    </div>
  )
}

function InferredConfirm({ message, onYes, onNo }) {
  return (
    <div className="inferred-card">
      <p className="inferred-message">{message}</p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>Based on your last 8 weeks of Strava data.</p>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="btn-confirm yes" onClick={onYes}>Yes, that's right</button>
        <button className="btn-confirm no" onClick={onNo}>Not quite</button>
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Onboarding({ onComplete, session }) {
  const [step, setStep] = useState(0)

  // Data loading
  const [activities, setActivities] = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const [detectedFtp, setDetectedFtp] = useState(null)
  const [weight, setWeight] = useState(null)
  const [weightSource, setWeightSource] = useState(null)
  const [weightInput, setWeightInput] = useState('')
  const [editingWeight, setEditingWeight] = useState(false)

  // Inference confidence tier ('high' | 'medium' | 'low')
  const [inferenceConfidence, setInferenceConfidence] = useState('low')

  // Goal
  const [goalType, setGoalType] = useState(null)
  const [ftpTarget, setFtpTarget] = useState('')   // always stored in watts
  const [ftpWattsInput, setFtpWattsInput] = useState('')
  const [ftpWkgInput, setFtpWkgInput] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [distanceTarget, setDistanceTarget] = useState(null)

  // Activity level
  const [activityLevel, setActivityLevel] = useState(null)
  const [inferredLevel, setInferredLevel] = useState(null)
  const [levelConfirmed, setLevelConfirmed] = useState(null)

  // Availability
  const [inferredDays, setInferredDays] = useState(null)
  const [daysPerWeek, setDaysPerWeek] = useState(null)
  const [changingDays, setChangingDays] = useState(null)
  const [inferredTime, setInferredTime] = useState(null)
  const [trainingTime, setTrainingTime] = useState(null)
  const [timeConfirmed, setTimeConfirmed] = useState(null)

  // Life context
  const [lifeContext, setLifeContext] = useState(null)

  // Structure
  const [structure, setStructure] = useState(null)
  const [inferredStructure, setInferredStructure] = useState(null)
  const [structureConfirmed, setStructureConfirmed] = useState(null)

  // Consistency (formerly discipline)
  const [discipline, setDiscipline] = useState(null)


  // Power breakdown (for FTP goal step)
  const [breakdown, setBreakdown] = useState(null)
  const [editingBreakdownLabel, setEditingBreakdownLabel] = useState(null)
  const [breakdownEditValue, setBreakdownEditValue] = useState('')

  // Coaching (new in v3 — step 8)
  const [coaching, setCoaching] = useState(null)

  // Non-negotiables
  const [nonNegotiables, setNonNegotiables] = useState([])
  const [customInput, setCustomInput] = useState('')

  // Supporting activities
  const [doingActivities, setDoingActivities] = useState([])
  const [keepingActivities, setKeepingActivities] = useState([])

  // ── Load data on mount ──
  useEffect(() => {
    async function load() {
      const token = session?.access_token
      if (!token) { setLoadingData(false); return }

      try {
        const data = await fetchActivities(token, 100)
        setActivities(data)

        const ftp = detectFTP(data)
        if (ftp) {
          setDetectedFtp(ftp)
          setBreakdown(detectPowerBreakdown(data, ftp.ftp))
        }

        const conf = computeInferenceConfidence(data)
        setInferenceConfidence(conf)

        const level = inferActivityLevel(data)
        const days = inferDaysPerWeek(data)
        const time = inferTrainingTime(data)
        const struct = inferStructure(data)

        setInferredLevel(level)
        setInferredDays(days)
        setInferredTime(time)
        setInferredStructure(struct)
        setDoingActivities(inferSupportingActivities(data))

        // High confidence: pre-apply all inferences silently
        if (conf === 'high') {
          if (level) { setActivityLevel(level); setLevelConfirmed(true) }
          if (days) { setDaysPerWeek(days); setChangingDays(false) }
          if (time) { setTrainingTime(time); setTimeConfirmed(true) }
          if (struct) { setStructure(struct); setStructureConfirmed(true) }
        }
      } catch (e) {
        console.error('Onboarding data load failed:', e)
      }

      // Weight — Withings first, fall back to manual
      const manual = getManualWeight()
      if (manual) { setWeight(manual); setWeightSource('manual') }

      const ws = getWithingsSession()
      if (ws?.access_token) {
        try {
          const w = await fetchLatestWeight(ws.access_token)
          if (w !== null) { setWeight(w); setWeightSource('withings') }
        } catch (e) {
          console.error('Withings fetch failed:', e)
        }
      }

      setLoadingData(false)
    }
    load()
  }, [])

  // ── Auto-skip high-confidence inference steps ──
  useEffect(() => {
    if (inferenceConfidence !== 'high' || loadingData) return
    if (step === 3 && activityLevel) { setStep(s => s + 1); return }
    if (step === 4 && daysPerWeek !== null && trainingTime) { setStep(s => s + 1); return }
    if (step === 6 && structure) { setStep(s => s + 1); return }
  }, [step, inferenceConfidence, loadingData, activityLevel, daysPerWeek, trainingTime, structure])

  const ftp = detectedFtp?.ftp ?? null
  const wkg = ftp && weight ? Math.round((ftp / weight) * 100) / 100 : null
  const longestRide = getLongestRide(activities)

  function next() { setStep(s => s + 1) }
  function back() { setStep(s => s - 1) }

  function addCustomNonNeg() {
    const v = customInput.trim()
    if (v && !nonNegotiables.includes(v)) {
      setNonNegotiables(prev => [...prev, v])
      setCustomInput('')
    }
  }

  function handleComplete() {
    onComplete({
      goalType,
      ftpTarget: goalType === 'ftp' ? ftpTarget : null,
      distanceTarget: goalType === 'distance' ? distanceTarget : null,
      targetDate,
      activityLevel: activityLevel || inferredLevel,
      daysPerWeek: daysPerWeek || inferredDays,
      trainingTime: trainingTime || inferredTime,
      lifeContext,
      structure: structure || inferredStructure,
      discipline,
      coaching,
      nonNegotiables,
      supportingActivities: doingActivities,
      keptActivities: keepingActivities,
      inferenceConfidence,
      currentFtp: ftp,
      weight,
    })
  }

  // ── Loading ──
  if (loadingData) return (
    <div className="onboarding">
      <div className="done-screen">
        <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>Checking your Strava data…</p>
      </div>
    </div>
  )

  // ── Step 0: Your Numbers ──
  if (step === 0) return (
    <div className="onboarding">
      <div className="onboarding-step">
        <h1 className="onboarding-heading">Your numbers.</h1>
        <p className="onboarding-sub">Three numbers drive everything. Here's what we found.</p>

        <div className="metrics-grid" style={{ marginBottom: 24 }}>
          <div className="metric-card">
            <div className="metric-label">FTP</div>
            {ftp ? (
              <>
                <div className="metric-value">{ftp}<span className="metric-unit">W</span></div>
                <div className="metric-footer">
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{confidenceLabel(detectedFtp.confidence)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="metric-value" style={{ fontSize: 18, color: 'var(--text-tertiary)' }}>—</div>
                <div className="metric-footer" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Updates after your first qualifying ride
                </div>
              </>
            )}
          </div>

          <div className="metric-card">
            <div className="metric-label">W/kg</div>
            <div className="metric-value" style={{ fontSize: wkg ? 34 : 18, color: wkg ? 'var(--text)' : 'var(--text-tertiary)' }}>
              {wkg ?? '—'}
            </div>
            {!wkg && (
              <div className="metric-footer" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                Calculated from FTP ÷ weight
              </div>
            )}
          </div>

          <div className="metric-card wide">
            <div className="metric-label">Weight</div>
            {weight && !editingWeight ? (
              <>
                <div className="metric-value">{weight}<span className="metric-unit">kg</span></div>
                <div className="metric-footer" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {weightSource === 'withings' ? 'Withings' : 'Manual'}
                  </span>
                  <button onClick={() => { setWeightInput(String(weight)); setEditingWeight(true) }} style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Update
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="metric-value" style={{ fontSize: 18, color: 'var(--text-tertiary)' }}>—</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={redirectToWithings} className="weight-source-btn">Withings</button>
                  <button disabled className="weight-source-btn" style={{ opacity: 0.35 }}>InBody</button>
                </div>
                {editingWeight ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={weightInput}
                      onChange={e => setWeightInput(e.target.value)}
                      placeholder="74.5"
                      autoFocus
                      style={{ flex: 1, background: 'var(--bg)', border: 'none', borderRadius: 8, padding: '8px 10px', fontSize: 15, fontFamily: 'var(--font)', outline: 'none' }}
                    />
                    <button
                      onClick={() => {
                        const v = parseFloat(weightInput)
                        if (v > 0) { setManualWeight(v); setWeight(v); setWeightSource('manual') }
                        setEditingWeight(false)
                      }}
                      style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
                    >
                      Save
                    </button>
                    <button onClick={() => setEditingWeight(false)} style={{ background: 'var(--bg)', border: 'none', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                      ✕
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setEditingWeight(true)} style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
                    enter manually
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Power breakdown */}
        {breakdown && (
          <div style={{ marginTop: 8 }}>
            {['sprint', 'attack', 'climb'].map(cat => (
              <div key={cat} className="breakdown-section" style={{ marginBottom: 10 }}>
                <div className="breakdown-title" style={{ textTransform: 'capitalize' }}>{cat}</div>
                {breakdown[cat].map(row => {
                  const wkg = row.watts && weight ? Math.round((row.watts / weight) * 100) / 100 : null
                  return (
                    <div key={row.label} className="breakdown-row" style={{ cursor: 'default' }}>
                      <span className="breakdown-label">{row.label}</span>
                      <div className="breakdown-values">
                        {row.watts
                          ? <>
                              <span className="breakdown-watts">{row.watts}<span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 2 }}>W</span></span>
                              {wkg && <span className="breakdown-wkg">{wkg} <span style={{ fontSize: 11 }}>W/kg</span></span>}
                            </>
                          : <span style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>—</span>
                        }
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        <div className="spacer" />
        <button className="btn-primary" onClick={next} disabled={!weight}>
          {weight ? 'Continue' : 'Add weight to continue'}
        </button>
        {import.meta.env.DEV && !weight && (
          <button className="btn-secondary" style={{ opacity: 0.5, fontSize: 12 }} onClick={next}>
            Skip weight (dev only)
          </button>
        )}
      </div>
    </div>
  )

  // ── Step 1: Goal type ──
  if (step === 1) return (
    <div className="onboarding">
      <div className="onboarding-step">
        <ProgressBar step={step} />
        <h1 className="onboarding-heading">What are you working toward?</h1>
        <p className="onboarding-sub">Everything we build is pointed at this.</p>

        <div className="picker-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 0 }}>
          <button
            className={`picker-option goal-type-card${goalType === 'ftp' ? ' selected' : ''}`}
            onClick={() => setGoalType('ftp')}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚡</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Improve FTP</div>
            <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4, lineHeight: 1.4 }}>Build raw power</div>
          </button>
          <button
            className={`picker-option goal-type-card${goalType === 'distance' ? ' selected' : ''}`}
            onClick={() => setGoalType('distance')}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>🏁</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Ride a distance</div>
            <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4, lineHeight: 1.4 }}>Hit a target ride</div>
          </button>
        </div>

        <div className="spacer" />
        <button className="btn-primary" onClick={next} disabled={!goalType}>Continue</button>
        <button className="btn-secondary" onClick={back}>Back</button>
      </div>
    </div>
  )

  // ── Step 2: Goal details ──
  if (step === 2) {

    // FTP goal
    if (goalType === 'ftp') {
      const targetW = parseFloat(ftpTarget) || 0
      const showImpact = weight && targetW > 0
      const currentWkg = ftp && weight ? Math.round((ftp / weight) * 100) / 100 : null
      const targetWkg = showImpact ? Math.round((targetW / weight) * 100) / 100 : null
      const targetWkgLighter = showImpact ? Math.round((targetW / (weight - 3)) * 100) / 100 : null
      const targetWkgHeavier = showImpact ? Math.round((targetW / (weight + 1)) * 100) / 100 : null
      const targetBreakdown = targetW > 50 ? detectPowerBreakdown(activities, targetW) : null

      function handleWattsChange(val) {
        setFtpWattsInput(val)
        const w = parseFloat(val)
        if (w > 0) {
          setFtpTarget(String(Math.round(w)))
          if (weight) setFtpWkgInput(String(Math.round(w / weight * 100) / 100))
        } else {
          setFtpTarget('')
          setFtpWkgInput('')
        }
      }

      function handleWkgChange(val) {
        setFtpWkgInput(val)
        const wkgVal = parseFloat(val)
        if (wkgVal > 0 && weight) {
          const watts = Math.round(wkgVal * weight)
          setFtpWattsInput(String(watts))
          setFtpTarget(String(watts))
        } else {
          setFtpWattsInput('')
          setFtpTarget('')
        }
      }

      function handleBreakdownEdit(label, val) {
        const newWatts = parseInt(val, 10)
        if (newWatts > 0) {
          const newFtp = ftpFromDurationPower(label, newWatts)
          if (newFtp) {
            setFtpTarget(String(newFtp))
            setFtpWattsInput(String(newFtp))
            if (weight) setFtpWkgInput(String(Math.round(newFtp / weight * 100) / 100))
          }
        }
        setEditingBreakdownLabel(null)
      }

      return (
        <div className="onboarding">
          <div className="onboarding-step">
            <ProgressBar step={step} />
            <h1 className="onboarding-heading">Set your FTP target.</h1>
            {ftp
              ? <p className="onboarding-sub">Your current FTP is <strong>{ftp}W</strong>{currentWkg ? ` · ${currentWkg} W/kg` : ''}. Where do you want to take it?</p>
              : <p className="onboarding-sub">We'll detect your FTP from your rides. Set a target for where you want to get to.</p>
            }

            <div className="field-label">Target FTP</div>
            <div className="ftp-dual-input">
              <div className="ftp-dual-field">
                <input
                  className="input-field"
                  type="number"
                  inputMode="numeric"
                  value={ftpWattsInput}
                  onChange={e => handleWattsChange(e.target.value)}
                  placeholder={ftp ? String(Math.round(ftp * 1.1)) : '280'}
                />
                <span className="ftp-dual-unit">W</span>
              </div>
              {weight && (
                <>
                  <span className="ftp-dual-sep">=</span>
                  <div className="ftp-dual-field">
                    <input
                      className="input-field"
                      type="number"
                      inputMode="decimal"
                      value={ftpWkgInput}
                      onChange={e => handleWkgChange(e.target.value)}
                      placeholder={currentWkg ? String(Math.round(currentWkg * 1.1 * 100) / 100) : '4.0'}
                    />
                    <span className="ftp-dual-unit">W/kg</span>
                  </div>
                </>
              )}
            </div>

            {showImpact && (
              <div className="weight-impact-panel">
                <div className="weight-impact-row">
                  <span>At your current weight ({weight}kg)</span>
                  <span className="weight-impact-val">{targetWkg} W/kg</span>
                </div>
                <div className="weight-impact-row" style={{ opacity: 0.75 }}>
                  <span>At {weight - 3}kg — 3kg lighter, same power</span>
                  <span className="weight-impact-val">{targetWkgLighter} W/kg</span>
                </div>
                <div className="weight-impact-row" style={{ opacity: 0.6 }}>
                  <span>At {weight + 1}kg — 1kg heavier, same power</span>
                  <span className="weight-impact-val">{targetWkgHeavier} W/kg</span>
                </div>
              </div>
            )}

            <div className="field-label">By when</div>
            <div className="input-row">
              <input className="input-field" type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
            </div>

            {(breakdown || targetBreakdown) && (
              <>
                <div className="field-label" style={{ marginTop: 8 }}>Power breakdown</div>
                {targetBreakdown && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Tap a target number to adjust it — it updates your FTP.</p>}
                {['sprint', 'attack', 'climb'].map(cat => (
                  <div key={cat} className="breakdown-section" style={{ marginBottom: 10 }}>
                    <div className="breakdown-row" style={{ cursor: 'default', paddingBottom: 4 }}>
                      <span className="breakdown-title" style={{ padding: 0 }}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                      <div className="breakdown-values">
                        {breakdown && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 56, textAlign: 'right' }}>Now</span>}
                        {targetBreakdown && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)', minWidth: 56, textAlign: 'right' }}>Target</span>}
                      </div>
                    </div>
                    {(breakdown || targetBreakdown)[cat].map(row => {
                      const currentRow = breakdown?.[cat].find(r => r.label === row.label)
                      const targetRow = targetBreakdown?.[cat].find(r => r.label === row.label)
                      const isEditing = editingBreakdownLabel === row.label
                      return (
                        <div key={row.label} className="breakdown-row" onClick={() => !isEditing && targetRow && setEditingBreakdownLabel(row.label)}>
                          <span className="breakdown-label">{row.label}</span>
                          {isEditing ? (
                            <div className="breakdown-edit" onClick={e => e.stopPropagation()}>
                              <input type="number" inputMode="numeric" value={breakdownEditValue}
                                onChange={e => setBreakdownEditValue(e.target.value)} autoFocus
                                style={{ width: 72, background: 'var(--bg)', border: 'none', borderRadius: 8, padding: '4px 8px', fontSize: 15, fontFamily: 'var(--font)', outline: 'none', textAlign: 'right' }} />
                              <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 4 }}>W</span>
                              <button onClick={() => handleBreakdownEdit(row.label, breakdownEditValue)}
                                style={{ marginLeft: 8, fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}>Done</button>
                            </div>
                          ) : (
                            <div className="breakdown-values">
                              {breakdown && (
                                <span style={{ fontSize: 14, color: 'var(--text-secondary)', minWidth: 56, textAlign: 'right' }}>
                                  {currentRow?.watts ? `${currentRow.watts}W` : '—'}
                                </span>
                              )}
                              {targetBreakdown && (
                                <span style={{ fontSize: 14, fontWeight: 600, color: targetRow?.watts ? 'var(--primary)' : 'var(--text-tertiary)', minWidth: 56, textAlign: 'right' }}>
                                  {targetRow?.watts ? `${targetRow.watts}W` : '—'}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </>
            )}

            <div className="spacer" />
            <button className="btn-primary" onClick={next} disabled={!ftpTarget || !targetDate}>Continue</button>
            <button className="btn-secondary" onClick={back}>Back</button>
          </div>
        </div>
      )
    }

    // Distance goal
    return (
      <div className="onboarding">
        <div className="onboarding-step">
          <ProgressBar step={step} />
          <h1 className="onboarding-heading">Pick your target distance.</h1>
          {longestRide
            ? <p className="onboarding-sub">Your longest ride was <strong>{longestRide.km}km</strong> on {longestRide.date}.</p>
            : <p className="onboarding-sub">How far do you want to ride?</p>
          }

          <div className="picker-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 24 }}>
            {distanceGoals.map(d => (
              <button
                key={d.value}
                className={`picker-option${distanceTarget === d.value ? ' selected' : ''}`}
                onClick={() => setDistanceTarget(d.value)}
                style={{ textAlign: 'center', padding: '20px 12px' }}
              >
                <div style={{ fontSize: 22, fontWeight: 700 }}>{d.label}</div>
              </button>
            ))}
          </div>

          <div className="field-label">By when</div>
          <div className="input-row">
            <input className="input-field" type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
          </div>

          <div className="spacer" />
          <button className="btn-primary" onClick={next} disabled={!distanceTarget || !targetDate}>Continue</button>
          <button className="btn-secondary" onClick={back}>Back</button>
        </div>
      </div>
    )
  }

  // ── Step 3: Activity level ──
  if (step === 3) {
    const levelLabel = activityLevelOptions.find(o => o.value === inferredLevel)?.label

    // Medium confidence: show confirmation
    if (inferredLevel && levelConfirmed === null && inferenceConfidence === 'medium') return (
      <div className="onboarding">
        <div className="onboarding-step">
          <ProgressBar step={step} />
          <h1 className="onboarding-heading">How active are you?</h1>
          <p className="onboarding-sub">Based on your recent rides, it looks like:</p>
          <InferredConfirm
            message={levelLabel}
            onYes={() => { setActivityLevel(inferredLevel); setLevelConfirmed(true); next() }}
            onNo={() => setLevelConfirmed(false)}
          />
          <div className="spacer" />
          <button className="btn-secondary" onClick={back}>Back</button>
        </div>
      </div>
    )

    // Low confidence or user said no: full picker
    return (
      <div className="onboarding">
        <div className="onboarding-step">
          <ProgressBar step={step} />
          <h1 className="onboarding-heading">How active are you right now?</h1>
          <p className="onboarding-sub">Be honest — this shapes what the app asks of you.</p>
          <Picker
            options={activityLevelOptions}
            value={activityLevel ?? inferredLevel}
            onChange={setActivityLevel}
          />
          <div className="spacer" />
          <button className="btn-primary" onClick={() => { setLevelConfirmed(true); next() }} disabled={!activityLevel && !inferredLevel}>Continue</button>
          <button className="btn-secondary" onClick={back}>Back</button>
        </div>
      </div>
    )
  }

  // ── Step 4: Availability ──
  if (step === 4) {

    // Sub-step A: training frequency
    if (changingDays === null) {
      if (inferredDays && inferenceConfidence === 'medium') return (
        <div className="onboarding">
          <div className="onboarding-step">
            <ProgressBar step={step} />
            <h1 className="onboarding-heading">How often do you train?</h1>
            <p className="onboarding-sub">From your recent rides, it looks like:</p>
            <InferredConfirm
              message={`You train about ${inferredDays} day${inferredDays > 1 ? 's' : ''} a week right now.`}
              onYes={() => { setDaysPerWeek(inferredDays); setChangingDays(false) }}
              onNo={() => setChangingDays(true)}
            />
            <div className="spacer" />
            <button className="btn-secondary" onClick={back}>Back</button>
          </div>
        </div>
      )
      // No inference or low confidence — go straight to slider
      setChangingDays(true)
    }

    if (changingDays) return (
      <div className="onboarding">
        <div className="onboarding-step">
          <ProgressBar step={step} />
          <h1 className="onboarding-heading">How many days a week will you train?</h1>
          <p className="onboarding-sub">Be realistic — this is what the plan is built around.</p>

          <div className="slider-row">
            <span className="slider-val">{daysPerWeek ?? inferredDays ?? 3}</span>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>days a week</span>
          </div>
          <input
            type="range" min={1} max={7} step={1}
            value={daysPerWeek ?? inferredDays ?? 3}
            onChange={e => setDaysPerWeek(Number(e.target.value))}
            className="day-slider"
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', padding: '0 2px', marginTop: 4 }}>
            <span>1</span><span>7</span>
          </div>

          <div className="spacer" />
          <button className="btn-primary" onClick={() => setChangingDays(false)} disabled={!daysPerWeek && !inferredDays}>
            Confirm
          </button>
          <button className="btn-secondary" onClick={back}>Back</button>
        </div>
      </div>
    )

    // Sub-step B: training time
    if (inferredTime && timeConfirmed === null && inferenceConfidence === 'medium') return (
      <div className="onboarding">
        <div className="onboarding-step">
          <ProgressBar step={step} />
          <h1 className="onboarding-heading">When do you prefer to train?</h1>
          <p className="onboarding-sub">Based on when you usually ride:</p>
          <InferredConfirm
            message={inferredTime === 'When it works' ? "You train at different times — no fixed pattern." : `You're mainly a ${inferredTime.toLowerCase()} trainer.`}
            onYes={() => { setTrainingTime(inferredTime); setTimeConfirmed(true); next() }}
            onNo={() => setTimeConfirmed(false)}
          />
          <div className="spacer" />
          <button className="btn-secondary" onClick={() => setChangingDays(null)}>Back</button>
        </div>
      </div>
    )

    if (timeConfirmed === false || (!inferredTime && !trainingTime)) return (
      <div className="onboarding">
        <div className="onboarding-step">
          <ProgressBar step={step} />
          <h1 className="onboarding-heading">When do you prefer to train?</h1>
          <p className="onboarding-sub">This helps us read your data in context.</p>
          <Picker
            options={['Mornings', 'Lunch', 'Evenings', 'When it works']}
            value={trainingTime}
            onChange={setTrainingTime}
            cols={2}
          />
          <div className="spacer" />
          <button className="btn-primary" onClick={() => { setTimeConfirmed(true); next() }} disabled={!trainingTime}>Continue</button>
          <button className="btn-secondary" onClick={() => setChangingDays(null)}>Back</button>
        </div>
      </div>
    )

    next()
    return null
  }

  // ── Step 5: Life context ──
  if (step === 5) return (
    <div className="onboarding">
      <div className="onboarding-step">
        <ProgressBar step={step} />
        <h1 className="onboarding-heading">What does your week look like?</h1>
        {inferredDays
          ? <p className="onboarding-sub">Your Strava data shows you train around <strong>{inferredDays} day{inferredDays > 1 ? 's' : ''} a week</strong>. But what does training actually compete with?</p>
          : <p className="onboarding-sub">Two people with the same schedule can have completely different relationships to training.</p>
        }
        <Picker options={lifeContextOptions} value={lifeContext} onChange={setLifeContext} />
        <div className="spacer" />
        <button className="btn-primary" onClick={next} disabled={!lifeContext}>Continue</button>
        <button className="btn-secondary" onClick={back}>Back</button>
      </div>
    </div>
  )

  // ── Step 6: Structure relationship ──
  if (step === 6) {
    const structureLabel = structureOptions.find(o => o.value === inferredStructure)?.label

    if (inferredStructure && structureConfirmed === null && inferenceConfidence === 'medium') return (
      <div className="onboarding">
        <div className="onboarding-step">
          <ProgressBar step={step} />
          <h1 className="onboarding-heading">How do you relate to structure?</h1>
          <p className="onboarding-sub">From your training patterns, it looks like:</p>
          <InferredConfirm
            message={structureLabel}
            onYes={() => { setStructure(inferredStructure); setStructureConfirmed(true); next() }}
            onNo={() => setStructureConfirmed(false)}
          />
          <div className="spacer" />
          <button className="btn-secondary" onClick={back}>Back</button>
        </div>
      </div>
    )

    return (
      <div className="onboarding">
        <div className="onboarding-step">
          <ProgressBar step={step} />
          <h1 className="onboarding-heading">How do you relate to training structure?</h1>
          <p className="onboarding-sub">No right answer. This shapes how the app coaches you.</p>
          <Picker
            options={structureOptions}
            value={structure ?? inferredStructure}
            onChange={setStructure}
          />
          <div className="spacer" />
          <button className="btn-primary" onClick={() => { setStructureConfirmed(true); next() }} disabled={!structure && !inferredStructure}>Continue</button>
          <button className="btn-secondary" onClick={back}>Back</button>
        </div>
      </div>
    )
  }

  // ── Step 7: Consistency goal ──
  if (step === 7) return (
    <div className="onboarding">
      <div className="onboarding-step">
        <ProgressBar step={step} />
        <h1 className="onboarding-heading">How consistent do you want to be?</h1>
        <p className="onboarding-sub">Separate from your performance goal. This shapes how the app talks to you over time.</p>
        <Picker options={consistencyOptions} value={discipline} onChange={setDiscipline} />
        <div className="spacer" />
        <button className="btn-primary" onClick={next} disabled={!discipline}>Continue</button>
        <button className="btn-secondary" onClick={back}>Back</button>
      </div>
    </div>
  )

  // ── Step 8: Coaching question (new in v3) ──
  if (step === 8) return (
    <div className="onboarding">
      <div className="onboarding-step">
        <ProgressBar step={step} />
        <h1 className="onboarding-heading">Who coaches you?</h1>
        <p className="onboarding-sub">This changes what the app does for you.</p>

        <div className="picker-grid" style={{ gridTemplateColumns: '1fr' }}>
          {coachingOptions.map(opt => (
            <button
              key={opt.value}
              className={`picker-option coaching-option${coaching === opt.value ? ' selected' : ''}`}
              onClick={() => setCoaching(opt.value)}
              style={{ textAlign: 'left' }}
            >
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 3 }}>{opt.label}</div>
              <div style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.4 }}>{opt.sub}</div>
            </button>
          ))}
        </div>

        {coaching === 'ai' && (
          <div className="ai-coach-note">
            <p>Integration with AI coaching assistants is coming. For now, tell us which platform you use — we'll capture it for when we build the connection.</p>
          </div>
        )}

        <div className="spacer" />
        <button className="btn-primary" onClick={next} disabled={!coaching}>Continue</button>
        <button className="btn-secondary" onClick={back}>Back</button>
      </div>
    </div>
  )

  // ── Step 9: Non-negotiables ──
  if (step === 9) return (
    <div className="onboarding">
      <div className="onboarding-step">
        <ProgressBar step={step} />
        <h1 className="onboarding-heading">What's non-negotiable?</h1>
        <p className="onboarding-sub">Things you'll always do regardless of the plan. The app never treats these as missed training.</p>

        <MultiSelect options={nonNegotiablePresets} values={nonNegotiables} onChange={setNonNegotiables} />

        {nonNegotiables.filter(n => !nonNegotiablePresets.includes(n)).map(c => (
          <div key={c} className="custom-tag">
            <span>{c}</span>
            <button onClick={() => setNonNegotiables(nonNegotiables.filter(n => n !== c))}>×</button>
          </div>
        ))}

        <div className="input-row" style={{ marginTop: 12 }}>
          <input
            className="input-field"
            type="text"
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            placeholder="Add your own…"
            onKeyDown={e => e.key === 'Enter' && addCustomNonNeg()}
          />
          <button
            className="input-suffix"
            onClick={addCustomNonNeg}
            style={{ cursor: 'pointer', color: customInput.trim() ? 'var(--primary)' : 'var(--text-tertiary)', background: 'var(--card)', border: 'none', borderRadius: 12 }}
          >
            Add
          </button>
        </div>

        <div className="spacer" />
        <button className="btn-primary" onClick={next}>
          {nonNegotiables.length === 0 ? 'Skip for now' : 'Continue'}
        </button>
        <button className="btn-secondary" onClick={back}>Back</button>
      </div>
    </div>
  )

  // ── Step 10: Supporting activities A ──
  if (step === 10) return (
    <div className="onboarding">
      <div className="onboarding-step">
        <ProgressBar step={step} />
        <h1 className="onboarding-heading">What else do you train?</h1>
        <p className="onboarding-sub">
          {doingActivities.length > 0
            ? "We found these in your Strava. Add anything that's missing."
            : 'Select everything you currently train, not just cycling.'
          }
        </p>

        <MultiSelect
          options={supportingActivities}
          values={doingActivities}
          onChange={setDoingActivities}
        />

        <div className="spacer" />
        <button
          className="btn-primary"
          onClick={() => { setKeepingActivities([...doingActivities]); next() }}
        >
          {doingActivities.length === 0 ? 'Nothing else, continue' : 'Continue'}
        </button>
        <button className="btn-secondary" onClick={back}>Back</button>
      </div>
    </div>
  )

  // ── Step 11: Supporting activities B ──
  if (step === 11) {
    if (doingActivities.length === 0) {
      next()
      return null
    }
    return (
      <div className="onboarding">
        <div className="onboarding-step">
          <ProgressBar step={step} />
          <h1 className="onboarding-heading">What are you keeping?</h1>
          <p className="onboarding-sub">Of those, which will you keep while working toward your goal? Unselect anything you're pausing.</p>

          <MultiSelect
            options={doingActivities}
            values={keepingActivities}
            onChange={setKeepingActivities}
          />

          <div className="spacer" />
          <button className="btn-primary" onClick={next}>Continue</button>
          <button className="btn-secondary" onClick={back}>Back</button>
        </div>
      </div>
    )
  }

  // ── Step 12: Done ──
  const goalSummary = goalType === 'ftp'
    ? `Target ${ftpTarget}W${ftp ? ` — up from your current ${ftp}W` : ''}.`
    : `Ride ${distanceTarget}km${longestRide ? ` — your longest so far is ${longestRide.km}km` : ''}.`

  const dateSummary = targetDate
    ? `By ${new Date(targetDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`
    : ''

  const coachingLabel = coachingOptions.find(o => o.value === coaching)?.label || ''

  return (
    <div className="onboarding">
      <div className="done-screen">
        <div className="done-icon">🎯</div>
        <div className="done-title">You're all set.</div>
        <p className="done-sub">{goalSummary} {dateSummary}</p>
        {coaching && (
          <p className="done-sub" style={{ marginTop: 8, fontSize: 13, opacity: 0.65 }}>{coachingLabel}.</p>
        )}
        {nonNegotiables.length > 0 && (
          <p className="done-sub" style={{ marginTop: 4, fontSize: 13, opacity: 0.65 }}>
            {nonNegotiables.length} non-negotiable{nonNegotiables.length > 1 ? 's' : ''} locked in.
          </p>
        )}
        {keepingActivities.length > 0 && (
          <p className="done-sub" style={{ marginTop: 4, fontSize: 13, opacity: 0.65 }}>
            Keeping {keepingActivities.join(', ').toLowerCase()} in the mix.
          </p>
        )}
        <div style={{ marginTop: 28, width: '100%' }}>
          <button className="btn-primary" onClick={handleComplete}>Go to dashboard</button>
        </div>
      </div>
    </div>
  )
}

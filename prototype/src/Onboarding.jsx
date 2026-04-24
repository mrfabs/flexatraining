import { useState, useEffect, useRef } from 'react'
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
import { saveUploadedPlan } from './uploadedPlan.js'

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

// ── Claude plan generation screen (self-coached) ─────────────────────────────

const PLAN_SYSTEM_PROMPT = `You are a cycling training planner. Generate a personal training plan based on the athlete's profile.

Output ONLY Markdown blocks in this exact format — one block per training day, no rest days, no intro text, no section headers, no explanation:

## YYYY-MM-DD
**Session:** [name]
**Duration:** [minutes] min
**Intensity:** [easy / moderate / hard]
**Description:** [what to do and why]`

function ClaudeGeneratePlanScreen({ profile, onDone }) {
  const [status, setStatus] = useState('generating') // 'generating' | 'done' | 'error'
  const [sessionCount, setSessionCount] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function generate() {
      try {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        const startDate = tomorrow.toISOString().split('T')[0]

        const lines = [`Generate an 8-week cycling training plan starting from ${startDate}.`, '', 'Athlete profile:']
        if (profile.goalType === 'ftp' && profile.ftpTarget) {
          lines.push(`- Goal: reach FTP ${profile.ftpTarget}W by ${profile.targetDate || 'end of plan'}`)
        } else if (profile.goalType === 'granfondo' && profile.distanceTarget) {
          lines.push(`- Goal: complete a ${profile.distanceTarget}km ride by ${profile.targetDate || 'end of plan'}`)
        }
        if (profile.ftp) lines.push(`- Current FTP: ${profile.ftp}W`)
        if (profile.weight) lines.push(`- Weight: ${profile.weight}kg`)
        lines.push(`- Training days per week: ${profile.daysPerWeek ?? 4}`)
        if (profile.activityLevel) lines.push(`- Activity level: ${profile.activityLevel}`)
        if (profile.trainingTime) lines.push(`- Preferred training time: ${profile.trainingTime}`)

        const userMessage = lines.join('\n')

        const planRes = await fetch('/api/claude-feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemPrompt: PLAN_SYSTEM_PROMPT, userMessage, maxTokens: 4000 }),
        })
        const planData = await planRes.json()
        if (!planRes.ok) throw new Error(planData.error || 'Plan generation failed.')
        const markdown = planData.content?.[0]?.text
        if (!markdown) throw new Error('Empty response from Claude.')

        const today = new Date().toISOString().split('T')[0]
        const parseRes = await fetch('/api/parse-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown, today }),
        })
        const parseData = await parseRes.json()
        if (!parseRes.ok) throw new Error(parseData.error || 'Could not parse generated plan.')
        const count = Object.keys(parseData.plan).length
        if (count === 0) throw new Error('Generated plan had no sessions.')
        saveUploadedPlan(parseData.plan)
        setSessionCount(count)
        setStatus('done')
      } catch (e) {
        setError(e.message)
        setStatus('error')
      }
    }
    generate()
  }, [])

  if (status === 'generating') {
    return (
      <div className="onboarding">
        <div className="onboarding-step">
          <div style={{ textAlign: 'center', padding: '32px 0 24px' }}>
            <p className="onboarding-sub" style={{ marginTop: 40 }}>Building your plan…</p>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="onboarding">
        <div className="onboarding-step">
          <h1 className="onboarding-heading">Something went wrong.</h1>
          <div style={{ background: 'rgba(255,59,48,0.08)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: 'var(--red)', lineHeight: 1.5 }}>
            {error}
          </div>
          <button className="btn-primary" onClick={() => { setStatus('generating'); setError(null) }}>Try again</button>
          <div className="spacer" />
          <button className="btn-secondary" onClick={onDone}>Skip for now</button>
        </div>
      </div>
    )
  }

  return (
    <div className="onboarding">
      <div className="onboarding-step">
        <div style={{ textAlign: 'center', padding: '32px 0 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h1 className="onboarding-heading">Your plan is ready.</h1>
          <p className="onboarding-sub">{sessionCount} sessions across the next 8 weeks. The dashboard will follow it from today.</p>
        </div>
        <div className="spacer" />
        <button className="btn-primary" onClick={onDone}>Continue</button>
      </div>
    </div>
  )
}

// ── AI coach upload screen ───────────────────────────────────────────────────

const AI_COACH_PROMPT = `Turn my current training plan into this format, one block per training day:

## YYYY-MM-DD
**Session:** [name]
**Duration:** [minutes] min
**Intensity:** [easy / moderate / hard]
**Description:** [what to do and why]

Use real dates. Skip rest days. Output only the Markdown, no extra text. Save it as a .md file.

[paste your plan here]`

function AICoachUploadScreen({ onDone }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [sessionCount, setSessionCount] = useState(null)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef(null)

  async function handleFile(file) {
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const text = await file.text()
      const today = new Date().toISOString().split('T')[0]
      const res = await fetch('/api/parse-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: text, today }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed. Please try again.')
      const count = Object.keys(data.plan).length
      if (count === 0) throw new Error('No sessions found in the file. Check the format and try again.')
      saveUploadedPlan(data.plan)
      setSessionCount(count)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  function copyPrompt() {
    navigator.clipboard.writeText(AI_COACH_PROMPT).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  if (sessionCount !== null) {
    return (
      <div className="onboarding">
        <div className="onboarding-step">
          <div style={{ textAlign: 'center', padding: '32px 0 24px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h1 className="onboarding-heading">Plan uploaded.</h1>
            <p className="onboarding-sub">{sessionCount} sessions loaded from your coach's plan. The dashboard will follow it for as long as it runs.</p>
          </div>
          <div className="spacer" />
          <button className="btn-primary" onClick={onDone}>Continue</button>
        </div>
      </div>
    )
  }

  return (
    <div className="onboarding">
      <div className="onboarding-step">
        <h1 className="onboarding-heading">Upload your training plan.</h1>
        <p className="onboarding-sub">Copy the prompt below, paste it into your AI coach along with your current plan, then upload the Markdown file it gives you.</p>

        <div style={{ background: 'var(--card)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Copy this prompt to your AI coach</span>
            <button
              onClick={copyPrompt}
              style={{ fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
          <pre style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'var(--font)', lineHeight: 1.5 }}>
            {AI_COACH_PROMPT}
          </pre>
        </div>

        {error && (
          <div style={{ background: 'rgba(255,59,48,0.08)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: 'var(--red)', lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt"
          style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files?.[0])}
          onClick={e => { e.target.value = '' }}
        />

        <button
          className="btn-primary"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Parsing plan…' : error ? 'Try again' : 'Upload .md or .txt file'}
        </button>

        <div className="spacer" />
        <button className="btn-secondary" onClick={onDone}>I'll add my plan later</button>
      </div>
    </div>
  )
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

  // Step 0 breakdown toggle + FTP tooltip
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [showFtpTooltip, setShowFtpTooltip] = useState(false)

  // Step 9 days-off picker
  const [daysOff, setDaysOff] = useState([])

  // AI coach plan upload (shown after step 8 when coaching === 'ai')
  const [aiUploadStep, setAiUploadStep] = useState(false)
  // Claude plan generation (shown after step 8 when coaching === 'self')
  const [selfGenerateStep, setSelfGenerateStep] = useState(false)

  // Power goal (Step 2 — power branch)
  const [powerGoalMetric, setPowerGoalMetric] = useState(null)
  const [powerGoalTargetInput, setPowerGoalTargetInput] = useState('')
  const [powerGoalTarget, setPowerGoalTarget] = useState(null)

  // Goal start date (Step 2 — all goal types)
  const [goalStarted, setGoalStarted] = useState(null) // 'already' | 'now'
  const [goalStartDate, setGoalStartDate] = useState('')

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
    if (step === 4 && activityLevel) { setStep(s => s + 1); return }
    if (step === 5 && daysPerWeek !== null && trainingTime) { setStep(s => s + 1); return }
    if (step === 7 && structure) { setStep(s => s + 1); return }
  }, [step, inferenceConfidence, loadingData, activityLevel, daysPerWeek, trainingTime, structure])

  const ftp = detectedFtp?.ftp ?? null
  const wkg = ftp && weight ? Math.round((ftp / weight) * 100) / 100 : null
  const longestRide = getLongestRide(activities)

  function next() { setStep(s => s + 1) }
  function back() { setStep(s => s - 1) }

  function handleCoachingContinue() {
    if (coaching === 'ai') {
      setAiUploadStep(true)
    } else {
      next()
    }
  }

  function handleDisciplineContinue() {
    next()
  }

  function handleKeepingContinue() {
    if (coaching === 'self') {
      setSelfGenerateStep(true)
    } else {
      next()
    }
  }

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
      distanceTarget: goalType === 'granfondo' ? distanceTarget : null,
      powerGoalMetric: goalType === 'power' ? powerGoalMetric : null,
      powerGoalTarget: goalType === 'power' ? powerGoalTarget : null,
      targetDate,
      goalStartDate: goalStarted === 'already' && goalStartDate
        ? goalStartDate
        : goalStarted === 'now'
        ? new Date().toISOString().split('T')[0]
        : null,
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
      daysOff,
    })
  }

  // ── AI coach upload ──
  if (aiUploadStep) return (
    <AICoachUploadScreen onDone={() => { setAiUploadStep(false); setStep(6) }} />
  )

  // ── Claude plan generation ──
  if (selfGenerateStep) return (
    <ClaudeGeneratePlanScreen
      profile={{ goalType, ftpTarget, distanceTarget, targetDate, activityLevel, daysPerWeek, trainingTime, ftp, weight }}
      onDone={() => { setSelfGenerateStep(false); next() }}
    />
  )

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
        <p className="onboarding-sub">The most important metrics in cycling are power and weight.</p>

        <div className="metrics-grid" style={{ marginBottom: 24 }}>

          {/* Power card — FTP + W/kg inline */}
          <div className="metric-card" style={{ position: 'relative' }}>
            <div className="metric-label">Power (FTP)</div>
            {ftp ? (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <div className="metric-value">{ftp}<span className="metric-unit">W</span></div>
                  <button
                    onClick={() => setShowFtpTooltip(v => !v)}
                    style={{ fontSize: 14, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, fontFamily: 'inherit' }}
                  >
                    ⓘ
                  </button>
                </div>
                {showFtpTooltip && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--card)', borderRadius: 10, padding: '10px 12px', marginTop: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {detectedFtp?.sourceActivity?.name && (
                      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{detectedFtp.sourceActivity.name}</div>
                    )}
                    {detectedFtp?.sourceActivity?.start_date_local && (
                      <div>{new Date(detectedFtp.sourceActivity.start_date_local).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                    )}
                    <div style={{ marginTop: 4, color: 'var(--text-tertiary)' }}>{confidenceLabel(detectedFtp.confidence)}</div>
                  </div>
                )}
                {wkg ? (
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 6 }}>{wkg} W/kg</div>
                ) : (
                  <div className="metric-footer" style={{ fontSize: 11 }}>Add weight to see W/kg</div>
                )}
              </>
            ) : (
              <>
                <div className="metric-value" style={{ fontSize: 18, color: 'var(--text-tertiary)' }}>—</div>
                <div className="metric-footer" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Detected after your first qualifying ride
                </div>
              </>
            )}
          </div>

          {/* Weight card — manual entry primary */}
          <div className="metric-card">
            <div className="metric-label">Weight</div>
            {weight && !editingWeight ? (
              <>
                <div className="metric-value">{weight}<span className="metric-unit">kg</span></div>
                <div className="metric-footer" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {weightSource === 'withings' ? 'Withings' : 'Manual'}
                  </span>
                  <button onClick={() => { setWeightInput(String(weight)); setEditingWeight(true) }} style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Edit
                  </button>
                </div>
              </>
            ) : editingWeight ? (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input
                  type="number"
                  inputMode="decimal"
                  value={weightInput}
                  onChange={e => setWeightInput(e.target.value)}
                  placeholder="74.5"
                  autoFocus
                  style={{ flex: 1, minWidth: 0, background: 'var(--bg)', border: 'none', borderRadius: 8, padding: '8px 10px', fontSize: 15, fontFamily: 'var(--font)', outline: 'none' }}
                />
                <button
                  onClick={() => {
                    const v = parseFloat(weightInput)
                    if (v > 0) { setManualWeight(v); setWeight(v); setWeightSource('manual') }
                    setEditingWeight(false)
                  }}
                  style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
                >
                  Save
                </button>
              </div>
            ) : (
              <>
                <div className="metric-value" style={{ fontSize: 18, color: 'var(--text-tertiary)' }}>—</div>
                <button
                  onClick={() => setEditingWeight(true)}
                  style={{ marginTop: 8, fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Add weight
                </button>
              </>
            )}
          </div>

        </div>

        {/* Power breakdown (hidden behind toggle) */}
        {breakdown && (
          <div style={{ marginTop: 8 }}>
            {!showBreakdown ? (
              <button
                onClick={() => setShowBreakdown(true)}
                style={{ width: '100%', background: 'var(--card)', border: 'none', borderRadius: 12, padding: '13px 16px', fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left' }}
              >
                See power breakdown ›
              </button>
            ) : (
              <>
                {['sprint', 'attack', 'climb'].map(cat => (
                  <div key={cat} className="breakdown-section" style={{ marginBottom: 10 }}>
                    <div className="breakdown-title" style={{ textTransform: 'capitalize' }}>{cat}</div>
                    {breakdown[cat].map(row => {
                      const wkg = row.watts && weight ? Math.round((row.watts / weight) * 100) / 100 : null
                      return (
                        <div key={row.label} className="breakdown-row" style={{ cursor: 'default', background: row.label === '20min' ? 'rgba(0,122,255,0.05)' : undefined, borderRadius: row.label === '20min' ? 8 : undefined }}>
                          <span className="breakdown-label">
                            {row.label}
                            {row.label === '20min' && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--primary)', background: 'rgba(0,122,255,0.1)', borderRadius: 4, padding: '1px 5px' }}>FTP ref</span>}
                          </span>
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
              </>
            )}
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

  // ── Step 2: Goal type ──
  if (step === 2) return (
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
            className={`picker-option goal-type-card${goalType === 'power' ? ' selected' : ''}`}
            onClick={() => setGoalType('power')}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>🎯</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Target a power number</div>
            <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4, lineHeight: 1.4 }}>Pick a specific effort to improve</div>
          </button>
          <div
            className="picker-option goal-type-card"
            style={{ opacity: 0.4, position: 'relative' }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>🏔</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Gran Fondo</div>
            <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4, lineHeight: 1.4 }}>Train for a target event</div>
            <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, background: 'var(--border)', borderRadius: 6, padding: '2px 6px', color: 'var(--text-secondary)', fontWeight: 600 }}>Soon</div>
          </div>
          {[
            { emoji: '🏊', label: 'Ironman', sub: 'Triathlon training' },
            { emoji: '🌄', label: 'Ultra race', sub: 'Long-distance events' },
            { emoji: '🏆', label: 'Race fitness', sub: 'Peak for competition' },
            { emoji: '📈', label: 'Build volume', sub: 'Train more consistently' },
          ].map(g => (
            <div
              key={g.label}
              className="picker-option goal-type-card"
              style={{ opacity: 0.4, position: 'relative' }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>{g.emoji}</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{g.label}</div>
              <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4, lineHeight: 1.4 }}>{g.sub}</div>
              <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, background: 'var(--border)', borderRadius: 6, padding: '2px 6px', color: 'var(--text-secondary)', fontWeight: 600 }}>Soon</div>
            </div>
          ))}
        </div>

        <div className="spacer" />
        <button className="btn-primary" onClick={next} disabled={!goalType}>Continue</button>
        <button className="btn-secondary" onClick={back}>Back</button>
      </div>
    </div>
  )

  // ── Step 3: Goal details ──
  if (step === 3) {
    const startDateValid = goalStarted === 'now' || (goalStarted === 'already' && !!goalStartDate)

    const startBlock = targetDate ? (
      <div style={{ marginTop: 20 }}>
        <div className="field-label">Have you already started training for this?</div>
        <div className="picker-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 0 }}>
          <button
            className={`picker-option${goalStarted === 'already' ? ' selected' : ''}`}
            onClick={() => setGoalStarted('already')}
            style={{ textAlign: 'left' }}
          >
            Yes, I've started
          </button>
          <button
            className={`picker-option${goalStarted === 'now' ? ' selected' : ''}`}
            onClick={() => { setGoalStarted('now'); setGoalStartDate('') }}
            style={{ textAlign: 'left' }}
          >
            No, starting now
          </button>
        </div>
        {goalStarted === 'already' && (
          <>
            <div className="field-label" style={{ marginTop: 12 }}>When did you start?</div>
            <div className="input-row">
              <input
                className="input-field"
                type="date"
                value={goalStartDate}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setGoalStartDate(e.target.value)}
              />
            </div>
          </>
        )}
      </div>
    ) : null

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

            {startBlock}

            <div className="spacer" />
            <button className="btn-primary" onClick={next} disabled={!ftpTarget || !targetDate || !startDateValid}>Continue</button>
            <button className="btn-secondary" onClick={back}>Back</button>
          </div>
        </div>
      )
    }

    // Power goal
    if (goalType === 'power') {
      const allRows = breakdown ? [
        ...breakdown.sprint.map(r => ({ ...r, cat: 'Sprint' })),
        ...breakdown.attack.map(r => ({ ...r, cat: 'Attack' })),
        ...breakdown.climb.map(r => ({ ...r, cat: 'Climb' })),
      ] : []
      const selectedRow = allRows.find(r => r.label === powerGoalMetric)
      const projectedFtp = powerGoalTarget && powerGoalMetric
        ? ftpFromDurationPower(powerGoalMetric, powerGoalTarget)
        : null

      return (
        <div className="onboarding">
          <div className="onboarding-step">
            <ProgressBar step={step} />
            <h1 className="onboarding-heading">Which number do you want to improve?</h1>
            <p className="onboarding-sub">Pick the effort that matters most to your riding.</p>

            {!breakdown ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No power data found. Connect Strava rides with a power meter to unlock this.</p>
            ) : (
              <>
                {['sprint', 'attack', 'climb'].map(cat => (
                  <div key={cat} className="breakdown-section" style={{ marginBottom: 10 }}>
                    <div className="breakdown-title" style={{ textTransform: 'capitalize' }}>{cat}</div>
                    {breakdown[cat].map(row => {
                      const isSelected = powerGoalMetric === row.label
                      return (
                        <div
                          key={row.label}
                          className="breakdown-row"
                          style={{
                            cursor: row.watts ? 'pointer' : 'default',
                            background: isSelected ? 'rgba(0,122,255,0.08)' : 'transparent',
                            borderRadius: isSelected ? 8 : 0,
                          }}
                          onClick={() => row.watts && setPowerGoalMetric(row.label)}
                        >
                          <span className="breakdown-label" style={{ fontWeight: isSelected ? 700 : 400 }}>{row.label}</span>
                          <div className="breakdown-values">
                            {row.watts
                              ? <span className="breakdown-watts" style={{ color: isSelected ? 'var(--primary)' : undefined }}>{row.watts}<span style={{ fontSize: 11, marginLeft: 2 }}>W</span></span>
                              : <span style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>—</span>
                            }
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}

                {powerGoalMetric && selectedRow && (
                  <div style={{ background: 'var(--card)', borderRadius: 12, padding: '14px 16px', marginTop: 8 }}>
                    <div className="field-label" style={{ marginTop: 0 }}>Target for {powerGoalMetric}</div>
                    <div className="ftp-dual-field" style={{ marginBottom: 12 }}>
                      <input
                        className="input-field"
                        type="number"
                        inputMode="numeric"
                        value={powerGoalTargetInput}
                        onChange={e => {
                          setPowerGoalTargetInput(e.target.value)
                          const v = parseInt(e.target.value)
                          setPowerGoalTarget(v > 0 ? v : null)
                        }}
                        placeholder={selectedRow.watts ? String(Math.round(selectedRow.watts * 1.05)) : ''}
                        style={{ borderRadius: '12px 0 0 12px' }}
                      />
                      <span className="ftp-dual-unit">W</span>
                    </div>

                    <div className="weight-impact-panel" style={{ margin: 0 }}>
                      <div className="weight-impact-row">
                        <span>Current {powerGoalMetric}</span>
                        <span className="weight-impact-val">{selectedRow.watts}W</span>
                      </div>
                      {powerGoalTarget > 0 && (
                        <div className="weight-impact-row">
                          <span>Target {powerGoalMetric}</span>
                          <span className="weight-impact-val" style={{ color: 'var(--primary)' }}>{powerGoalTarget}W</span>
                        </div>
                      )}
                      {projectedFtp && (
                        <div className="weight-impact-row" style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                          <span>Projected FTP</span>
                          <span className="weight-impact-val">{ftp ? `${ftp}W → ${projectedFtp}W` : `~${projectedFtp}W`}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="field-label" style={{ marginTop: 16 }}>By when</div>
            <div className="input-row">
              <input className="input-field" type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
            </div>

            {startBlock}

            <div className="spacer" />
            <button className="btn-primary" onClick={next} disabled={!powerGoalMetric || !powerGoalTarget || !targetDate || !startDateValid}>Continue</button>
            <button className="btn-secondary" onClick={back}>Back</button>
          </div>
        </div>
      )
    }

    // Gran Fondo goal
    const GRANFONDO_DISTANCES = [
      { label: '80 km', value: 80 },
      { label: '120 km', value: 120 },
      { label: '160 km', value: 160 },
      { label: '200 km+', value: 200 },
    ]
    return (
      <div className="onboarding">
        <div className="onboarding-step">
          <ProgressBar step={step} />
          <h1 className="onboarding-heading">How long is your Gran Fondo?</h1>
          {longestRide
            ? <p className="onboarding-sub">Your longest ride so far was <strong>{longestRide.km}km</strong> on {longestRide.date}.</p>
            : <p className="onboarding-sub">Pick the target distance for your event.</p>
          }

          <div className="picker-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 24 }}>
            {GRANFONDO_DISTANCES.map(d => (
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

          {startBlock}

          <div className="spacer" />
          <button className="btn-primary" onClick={next} disabled={!distanceTarget || !targetDate || !startDateValid}>Continue</button>
          <button className="btn-secondary" onClick={back}>Back</button>
        </div>
      </div>
    )
  }

  // ── Step 4: Activity level ──
  if (step === 4) {
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

  // ── Step 5: Availability ──
  if (step === 5) {

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

  // ── Step 6: Life context ──
  if (step === 6) return (
    <div className="onboarding">
      <div className="onboarding-step">
        <ProgressBar step={step} />
        <h1 className="onboarding-heading">What does your week look like?</h1>
        <p className="onboarding-sub">
          {inferredDays
            ? `Your Strava shows ~${inferredDays} days a week${inferredTime && inferredTime !== 'When it works' ? `, mostly ${inferredTime.toLowerCase()}` : ''}. Two people with the same numbers can have very different relationships to training.`
            : 'Two people with the same schedule can have completely different relationships to training.'
          }
        </p>

        <Picker options={lifeContextOptions} value={lifeContext} onChange={setLifeContext} />
        <div className="spacer" />
        <button className="btn-primary" onClick={next} disabled={!lifeContext}>Continue</button>
        <button className="btn-secondary" onClick={back}>Back</button>
      </div>
    </div>
  )

  // ── Step 7: Structure relationship ──
  if (step === 7) {
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

  // ── Step 8: Consistency goal ──
  if (step === 8) return (
    <div className="onboarding">
      <div className="onboarding-step">
        <ProgressBar step={step} />
        <h1 className="onboarding-heading">How consistent do you want to be?</h1>
        <p className="onboarding-sub">Separate from your performance goal. This shapes how the app talks to you over time.</p>
        <Picker options={consistencyOptions} value={discipline} onChange={setDiscipline} />
        <div className="spacer" />
        <button className="btn-primary" onClick={handleDisciplineContinue} disabled={!discipline}>Continue</button>
        <button className="btn-secondary" onClick={back}>Back</button>
      </div>
    </div>
  )

  // ── Step 1: Coaching question ──
  if (step === 1) return (
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
              onClick={() => !opt.comingSoon && setCoaching(opt.value)}
              disabled={opt.comingSoon}
              style={{ textAlign: 'left', opacity: opt.comingSoon ? 0.5 : 1, cursor: opt.comingSoon ? 'default' : 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{opt.label}</span>
                {opt.comingSoon && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--card)', borderRadius: 4, padding: '2px 6px' }}>Coming soon</span>}
              </div>
              <div style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.4 }}>{opt.sub}</div>
            </button>
          ))}
        </div>

        <div className="spacer" />
        <button className="btn-primary" onClick={handleCoachingContinue} disabled={!coaching}>Continue</button>
        <button className="btn-secondary" onClick={back}>Back</button>
      </div>
    </div>
  )

  // ── Step 9: Non-negotiables ──
  if (step === 9) {
    const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const DAYS_OFF_KEY = 'Always take specific days off'

    function toggleNonNeg(key) {
      setNonNegotiables(prev =>
        prev.includes(key) ? prev.filter(n => n !== key) : [...prev, key]
      )
    }

    function toggleDayOff(day) {
      setDaysOff(prev =>
        prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
      )
    }

    const customItems = nonNegotiables.filter(n => !nonNegotiablePresets.includes(n))

    return (
      <div className="onboarding">
        <div className="onboarding-step">
          <ProgressBar step={step} />
          <h1 className="onboarding-heading">What's non-negotiable?</h1>
          <p className="onboarding-sub">Things you'll always do regardless of the plan. The app never treats these as missed training.</p>

          <div className="picker-grid" style={{ gridTemplateColumns: '1fr', gap: 8 }}>
            {nonNegotiablePresets.map(key => {
              const isSelected = nonNegotiables.includes(key)
              return (
                <div key={key}>
                  <button
                    className={`picker-option${isSelected ? ' selected' : ''}`}
                    onClick={() => toggleNonNeg(key)}
                    style={{ textAlign: 'left', padding: '13px 16px', width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}
                  >
                    <span style={{ opacity: isSelected ? 1 : 0.3, fontSize: 13 }}>{isSelected ? '✓' : '○'}</span>
                    {key}
                  </button>
                  {key === DAYS_OFF_KEY && isSelected && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 4px 2px' }}>
                      {DAYS_OF_WEEK.map(day => (
                        <button
                          key={day}
                          onClick={() => toggleDayOff(day)}
                          style={{
                            padding: '6px 10px',
                            fontSize: 13,
                            fontWeight: 600,
                            borderRadius: 8,
                            border: 'none',
                            cursor: 'pointer',
                            fontFamily: 'var(--font)',
                            background: daysOff.includes(day) ? 'var(--primary)' : 'var(--bg)',
                            color: daysOff.includes(day) ? '#fff' : 'var(--text-secondary)',
                          }}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {customItems.map(c => (
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
              placeholder="Add another…"
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
  }

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
      handleKeepingContinue()
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
          <button className="btn-primary" onClick={handleKeepingContinue}>Continue</button>
          <button className="btn-secondary" onClick={back}>Back</button>
        </div>
      </div>
    )
  }

  // ── Step 12: Done ──
  const powerCurrentWatts = powerGoalMetric && breakdown
    ? [...breakdown.sprint, ...breakdown.attack, ...breakdown.climb].find(r => r.label === powerGoalMetric)?.watts ?? null
    : null

  const goalSummary = coaching === 'ai'
    ? 'Your plan is uploaded and the app is ready to follow it.'
    : goalType === 'ftp'
    ? `Target ${ftpTarget}W${ftp ? ` — up from your current ${ftp}W` : ''}.`
    : goalType === 'power'
    ? `Target ${powerGoalTarget}W for ${powerGoalMetric}${powerCurrentWatts ? ` — currently at ${powerCurrentWatts}W` : ''}.`
    : `Train for a ${distanceTarget}km Gran Fondo${longestRide ? ` — your longest ride is ${longestRide.km}km` : ''}.`

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

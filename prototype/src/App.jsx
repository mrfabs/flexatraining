import { useState, useEffect, useRef } from 'react'
import StravaAuth from './StravaAuth.jsx'
import Onboarding from './Onboarding.jsx'
import Dashboard from './Dashboard.jsx'
import Stats from './Stats.jsx'
import Profile from './Profile.jsx'
import { exchangeCode, storeSession, getSession, clearSession, syncUser, saveProfile, saveNonNegotiables, saveGoal } from './auth.js'
import { exchangeWithingsCode, storeWithingsSession, WITHINGS_STATE, clearWithingsSession, getWithingsSession } from './withings.js'
import { generateWeekPlan, savePlan } from './plan.js'

// ── Passcode gate ────────────────────────────────────────────────────────────

const PASSCODE = 'flexa'
const GATE_KEY = 'prototype_access'

function Gate({ onUnlock }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function handleSubmit(e) {
    e.preventDefault()
    if (value === PASSCODE) {
      localStorage.setItem(GATE_KEY, '1')
      onUnlock()
    } else {
      setError(true)
      setValue('')
      setTimeout(() => setError(false), 1200)
    }
  }

  return (
    <div className="onboarding">
      <div className="done-screen">
        <p style={{ color: 'var(--text-secondary)', fontSize: 15, marginBottom: 24 }}>
          This is a private prototype.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 280 }}>
          <input
            ref={inputRef}
            type="password"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="Passcode"
            className={`input-field${error ? ' input-field--error' : ''}`}
            style={{ textAlign: 'center', letterSpacing: 4 }}
            autoComplete="off"
          />
          <button type="submit" className="btn-primary">Enter</button>
        </form>
        {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>Wrong passcode.</p>}
      </div>
    </div>
  )
}

// ── Debug panel (dev only) ───────────────────────────────────────────────────

function DebugPanel({ onClose, onReset }) {
  const session = getSession()
  const withings = getWithingsSession()

  const actions = [
    {
      label: 'Reset everything',
      sub: 'Clears all sessions and onboarding — back to sign in',
      color: 'var(--red)',
      fn: () => {
        localStorage.clear()
        window.location.reload()
      },
    },
    {
      label: 'Replay onboarding',
      sub: 'Keeps Strava session, clears onboarding flag',
      color: 'var(--orange)',
      fn: () => {
        if (session) localStorage.removeItem(`onboarding_complete_${session.athlete.id}`)
        window.location.reload()
      },
    },
    {
      label: 'Disconnect Withings',
      sub: withings ? 'Withings session active' : 'No Withings session',
      color: withings ? 'var(--orange)' : 'var(--text-tertiary)',
      fn: () => { clearWithingsSession(); window.location.reload() },
    },
  ]

  return (
    <>
      <div className="debug-backdrop" onClick={onClose} />
      <div className="debug-sheet">
        <div className="debug-handle" />
        <div className="debug-title">Debug</div>

        <div className="debug-state">
          <div className="debug-state-row">
            <span>Strava</span>
            <span style={{ color: session ? 'var(--green)' : 'var(--text-tertiary)' }}>
              {session ? session.athlete.firstname : 'none'}
            </span>
          </div>
          <div className="debug-state-row">
            <span>Withings</span>
            <span style={{ color: withings ? 'var(--green)' : 'var(--text-tertiary)' }}>
              {withings ? 'connected' : 'none'}
            </span>
          </div>
          <div className="debug-state-row">
            <span>Onboarding</span>
            <span style={{ color: session && localStorage.getItem(`onboarding_complete_${session?.athlete?.id}`) ? 'var(--green)' : 'var(--text-tertiary)' }}>
              {session && localStorage.getItem(`onboarding_complete_${session?.athlete?.id}`) ? 'complete' : 'pending'}
            </span>
          </div>
        </div>

        <div className="debug-actions">
          {actions.map(a => (
            <button key={a.label} className="debug-action" onClick={a.fn}>
              <span className="debug-action-label" style={{ color: a.color }}>{a.label}</span>
              <span className="debug-action-sub">{a.sub}</span>
            </button>
          ))}
        </div>

        <button className="debug-close" onClick={onClose}>Close</button>
      </div>
    </>
  )
}

function Loading() {
  return (
    <div className="onboarding">
      <div className="done-screen">
        <div style={{ fontSize: 32 }}>⏳</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>Connecting to Strava…</p>
      </div>
    </div>
  )
}

function HomeIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  )
}

function StatsIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6"  y1="20" x2="6"  y2="14" />
    </svg>
  )
}

function PersonIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}

export default function App() {
  const [screen, setScreen] = useState(() =>
    localStorage.getItem(GATE_KEY) ? 'loading' : 'gate'
  ) // gate | loading | auth | onboarding | app
  const [tab, setTab] = useState('dashboard')      // dashboard | stats | profile
  const [session, setSession] = useState(null)
  const [authError, setAuthError] = useState(null)
  const [debugOpen, setDebugOpen] = useState(false)

  // Shared metrics lifted so Profile can read them without refetching
  const [sharedFtp, setSharedFtp] = useState(null)
  const [sharedWeight, setSharedWeight] = useState(null)

  function handleMetricsUpdate({ ftp, weight }) {
    if (ftp !== undefined) setSharedFtp(ftp)
    if (weight !== undefined) setSharedWeight(weight)
  }

  useEffect(() => {
    if (screen === 'gate') return

    async function init() {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const error = params.get('error')
      const state = params.get('state')

      // Withings callback
      if (code && state === WITHINGS_STATE) {
        window.history.replaceState({}, '', '/')
        try {
          const tokenData = await exchangeWithingsCode(code)
          storeWithingsSession(tokenData)
        } catch (e) {
          console.error('Withings connect failed:', e)
        }
        const existing = getSession()
        if (existing) {
          setSession(existing)
          const completed = localStorage.getItem(`onboarding_complete_${existing.athlete.id}`)
          setScreen(completed ? 'app' : 'onboarding')
        } else {
          setScreen('auth')
        }
        return
      }

      // Strava declined
      if (error) {
        window.history.replaceState({}, '', '/')
        setAuthError('Strava access was declined. Please try again.')
        setScreen('auth')
        return
      }

      // Strava callback
      if (code) {
        window.history.replaceState({}, '', '/')
        try {
          const tokenData = await exchangeCode(code)
          storeSession(tokenData)
          await syncUser(tokenData.athlete)
          setSession(tokenData)
          setScreen('onboarding')
        } catch (e) {
          console.error(e)
          setAuthError('Something went wrong connecting to Strava. Try again.')
          setScreen('auth')
        }
        return
      }

      // Existing session
      const existing = getSession()
      if (existing) {
        setSession(existing)
        const completed = localStorage.getItem(`onboarding_complete_${existing.athlete.id}`)
        setScreen(completed ? 'app' : 'onboarding')
        return
      }

      setScreen('auth')
    }

    init()
  }, [screen])

  async function handleOnboardingComplete(profile) {
    if (session) {
      const athleteId = session.athlete.id

      // Persist full profile to localStorage for Profile screen
      localStorage.setItem(`onboarding_profile_${athleteId}`, JSON.stringify(profile))

      // If coaching themselves, generate and save a 1-week plan
      if (profile.coaching === 'self') {
        const weekPlan = generateWeekPlan({
          goalType: profile.goalType,
          daysPerWeek: profile.daysPerWeek ?? 4,
        })
        savePlan(athleteId, weekPlan)
      }

      // Supabase sync (best-effort — prototype)
      await saveProfile(athleteId, profile)
      await saveNonNegotiables(athleteId, profile.nonNegotiables)
      await saveGoal(athleteId, {
        ftpTarget: profile.ftpTarget,
        targetDate: profile.targetDate,
        currentFtp: profile.currentFtp ?? null,
      })
      localStorage.setItem(`onboarding_complete_${athleteId}`, '1')
    }
    setScreen('app')
  }

  function handleSignOut() {
    clearSession()
    setSession(null)
    setTab('dashboard')
    setScreen('auth')
  }

  if (screen === 'gate') return <Gate onUnlock={() => setScreen('loading')} />
  if (screen === 'loading') return <Loading />
  if (screen === 'auth') return (
    <>
      <StravaAuth error={authError} />
      {import.meta.env.DEV && <button className="debug-fab" onClick={() => setDebugOpen(true)}>DEV</button>}
      {debugOpen && <DebugPanel onClose={() => setDebugOpen(false)} />}
    </>
  )
  if (screen === 'onboarding') return (
    <>
      <Onboarding onComplete={handleOnboardingComplete} session={session} />
      {import.meta.env.DEV && <button className="debug-fab" onClick={() => setDebugOpen(true)}>DEV</button>}
      {debugOpen && <DebugPanel onClose={() => setDebugOpen(false)} />}
    </>
  )

  // Main app — both screens always mounted so Dashboard never loses calendar state
  return (
    <div className="app-container">
      {import.meta.env.DEV && <button className="debug-fab" onClick={() => setDebugOpen(true)}>DEV</button>}
      {debugOpen && <DebugPanel onClose={() => setDebugOpen(false)} />}
      <div className="screen-area">

        <div style={{ display: tab === 'dashboard' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
          <Dashboard
            session={session}
            onMetricsUpdate={handleMetricsUpdate}
          />
        </div>

        <div style={{ display: tab === 'stats' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
          <Stats
            session={session}
            onMetricsUpdate={handleMetricsUpdate}
          />
        </div>

        <div style={{ display: tab === 'profile' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
          <Profile
            session={session}
            onSignOut={handleSignOut}
            ftp={sharedFtp}
            weight={sharedWeight}
          />
        </div>

      </div>

      <nav className="tab-bar">
        <button className={`tab-item${tab === 'dashboard' ? ' active' : ''}`} onClick={() => setTab('dashboard')}>
          <HomeIcon active={tab === 'dashboard'} />
          <span>Home</span>
        </button>
        <button className={`tab-item${tab === 'stats' ? ' active' : ''}`} onClick={() => setTab('stats')}>
          <StatsIcon active={tab === 'stats'} />
          <span>Stats</span>
        </button>
        <button className={`tab-item${tab === 'profile' ? ' active' : ''}`} onClick={() => setTab('profile')}>
          <PersonIcon active={tab === 'profile'} />
          <span>Profile</span>
        </button>
      </nav>
    </div>
  )
}

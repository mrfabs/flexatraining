// Strava OAuth helpers
// ⚠️  PROTOTYPE ONLY: client secret is in the frontend env.
//     Before any public deployment, move the token exchange to a Supabase Edge Function.

import { supabase } from './supabase.js'

const CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID
const CLIENT_SECRET = import.meta.env.VITE_STRAVA_CLIENT_SECRET
const REDIRECT_URI = window.location.origin + '/'

// ── Redirect to Strava consent screen ──
export function redirectToStrava() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'read,activity:read_all,profile:read_all',
    approval_prompt: 'auto',
  })
  window.location.href = `https://www.strava.com/oauth/authorize?${params}`
}

// ── Exchange auth code for tokens + athlete ──
export async function exchangeCode(code) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  })

  if (!res.ok) throw new Error('Strava token exchange failed')
  return res.json() // { access_token, refresh_token, expires_at, athlete }
}

// ── Persist session to localStorage ──
export function storeSession(tokenData) {
  localStorage.setItem('strava_session', JSON.stringify({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: tokenData.expires_at,
    athlete: tokenData.athlete,
  }))
}

// ── Read session from localStorage ──
export function getSession() {
  const raw = localStorage.getItem('strava_session')
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

// ── Clear session (sign out) ──
export function clearSession() {
  localStorage.removeItem('strava_session')
}

// ── Create or update user in Supabase ──
export async function syncUser(athlete) {
  if (!supabase) {
    console.warn('Supabase not configured — skipping user sync')
    return null
  }

  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        strava_id: String(athlete.id),
        name: `${athlete.firstname} ${athlete.lastname}`,
        email: athlete.email || null,
        avatar_url: athlete.profile_medium || athlete.profile || null,
      },
      { onConflict: 'strava_id' }
    )
    .select()
    .single()

  if (error) console.error('User sync error:', error)
  return data
}

// ── Save onboarding profile to Supabase ──
export async function saveProfile(stravaId, profile) {
  if (!supabase) return null

  // Fetch user record to get internal UUID
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('strava_id', String(stravaId))
    .single()

  if (!user) return null

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(
      {
        user_id: user.id,
        training_hours: profile.hours,
        training_time: profile.trainingTime,
        lifestyle: profile.lifestyle,
        busy_definition: profile.busyDefinition,
        structure: profile.structure,
        discipline_goal: profile.discipline,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single()

  if (error) console.error('Profile save error:', error)
  return data
}

// ── Save non-negotiables to Supabase ──
export async function saveNonNegotiables(stravaId, items) {
  if (!supabase || items.length === 0) return null

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('strava_id', String(stravaId))
    .single()

  if (!user) return null

  const rows = items.map(description => ({
    user_id: user.id,
    description,
    category: 'custom',
    status: 'active',
  }))

  const { error } = await supabase.from('non_negotiables').insert(rows)
  if (error) console.error('Non-negotiables save error:', error)
}

// ── Save metric snapshot to Supabase ──
export async function saveMetricSnapshot(stravaId, { ftp, weight, ftpSource }) {
  if (!supabase) return null

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('strava_id', String(stravaId))
    .single()

  if (!user) return null

  const wkg = ftp && weight ? Math.round((ftp / weight) * 100) / 100 : null

  const { data, error } = await supabase
    .from('metric_snapshots')
    .insert({
      user_id: user.id,
      ftp: ftp || null,
      weight: weight || null,
      ftp_source: ftpSource || null,
    })
    .select()
    .single()

  if (error) console.error('Metric snapshot error:', error)
  return data
}

// ── Save goal to Supabase ──
export async function saveGoal(stravaId, { ftpTarget, targetDate, currentFtp }) {
  if (!supabase) return null

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('strava_id', String(stravaId))
    .single()

  if (!user) return null

  const { data, error } = await supabase
    .from('goals')
    .insert({
      user_id: user.id,
      type: 'ftp',
      target_value: Number(ftpTarget),
      target_date: targetDate,
      start_value: currentFtp || null,
      start_date: new Date().toISOString().split('T')[0],
      status: 'active',
    })
    .select()
    .single()

  if (error) console.error('Goal save error:', error)
  return data
}

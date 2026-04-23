// Withings OAuth helpers + weight fetch
// ⚠️  PROTOTYPE ONLY: client secret is in the frontend env.
//     Before any public deployment, move token exchange and measure fetch
//     to Supabase Edge Functions (Withings API is designed for server-side use;
//     direct browser requests may be blocked by CORS).

const CLIENT_ID = import.meta.env.VITE_WITHINGS_CLIENT_ID
const CLIENT_SECRET = import.meta.env.VITE_WITHINGS_CLIENT_SECRET
const REDIRECT_URI = window.location.origin + '/'
export const WITHINGS_STATE = 'withings_auth'

// ── Redirect to Withings consent screen ──
export function redirectToWithings() {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'user.metrics',
    state: WITHINGS_STATE,
  })
  window.location.href = `https://account.withings.com/oauth2_user/authorize2?${params}`
}

// ── Exchange auth code for tokens ──
export async function exchangeWithingsCode(code) {
  const body = new URLSearchParams({
    action: 'requesttoken',
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    redirect_uri: REDIRECT_URI,
  })

  const res = await fetch('https://wbsapi.withings.net/v2/oauth2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) throw new Error('Withings token exchange failed')
  const json = await res.json()
  if (json.status !== 0) throw new Error(`Withings error: ${json.status}`)
  return json.body // { access_token, refresh_token, expires_in, userid, ... }
}

// ── Persist Withings session to localStorage ──
export function storeWithingsSession(tokenData) {
  localStorage.setItem('withings_session', JSON.stringify({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + tokenData.expires_in,
  }))
}

// ── Read Withings session from localStorage ──
export function getWithingsSession() {
  const raw = localStorage.getItem('withings_session')
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

// ── Clear Withings session ──
export function clearWithingsSession() {
  localStorage.removeItem('withings_session')
}

// ── Manual weight (fallback when no connected scale) ──
export function getManualWeight() {
  const raw = localStorage.getItem('manual_weight')
  return raw ? parseFloat(raw) : null
}

export function setManualWeight(kg) {
  localStorage.setItem('manual_weight', String(kg))
}

export function clearManualWeight() {
  localStorage.removeItem('manual_weight')
}

// ── Fetch height (cm) ──
// meastype=4 returns height in metres; we convert to cm.
export async function fetchHeight(accessToken) {
  const params = new URLSearchParams({
    action: 'getmeas',
    meastype: 4,
    category: 1,
    limit: 1,
  })

  const res = await fetch(`https://wbsapi.withings.net/measure?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) throw new Error('Withings height fetch failed')
  const json = await res.json()
  if (json.status !== 0) return null  // not an error — user may not have height recorded

  const groups = json.body?.measuregrps
  if (!groups?.length) return null

  const measure = groups[0].measures?.find(m => m.type === 4)
  if (!measure) return null

  const metres = measure.value * Math.pow(10, measure.unit)
  return Math.round(metres * 100) // cm
}

// ── Store height to localStorage ──
export function getStoredHeight() {
  const raw = localStorage.getItem('height_cm')
  return raw ? parseInt(raw, 10) : null
}

export function storeHeight(cm) {
  localStorage.setItem('height_cm', String(cm))
}

// ── Fetch latest weight measurement (kg) ──
// Returns a number or null if no measurement found.
export async function fetchLatestWeight(accessToken) {
  const params = new URLSearchParams({
    action: 'getmeas',
    meastype: 1,   // 1 = weight (kg)
    category: 1,   // real measures, not objectives
    lastupdate: String(Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60), // last 30 days
    limit: 1,
  })

  const res = await fetch(`https://wbsapi.withings.net/measure?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) throw new Error('Withings measure fetch failed')
  const json = await res.json()
  if (json.status !== 0) throw new Error(`Withings measure error: ${json.status}`)

  const groups = json.body?.measuregrps
  if (!groups?.length) return null

  const weightMeasure = groups[0].measures?.find(m => m.type === 1)
  if (!weightMeasure) return null

  // Withings returns value * 10^unit (e.g. value=743, unit=-1 → 74.3 kg)
  return Math.round(weightMeasure.value * Math.pow(10, weightMeasure.unit) * 10) / 10
}

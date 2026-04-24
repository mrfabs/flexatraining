const UPLOADED_PLAN_KEY = 'uploaded_plan'

export function saveUploadedPlan(plan) {
  localStorage.setItem(UPLOADED_PLAN_KEY, JSON.stringify(plan))
}

export function loadUploadedPlan() {
  try {
    const raw = localStorage.getItem(UPLOADED_PLAN_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function getPlanSessionForDate(dateStr) {
  const plan = loadUploadedPlan()
  if (!plan) return null
  return plan[dateStr] || null
}

export function clearUploadedPlan() {
  localStorage.removeItem(UPLOADED_PLAN_KEY)
}

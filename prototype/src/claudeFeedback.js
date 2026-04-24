// claudeFeedback.js — Claude API integration for coaching feedback

const SYSTEM_PROMPT = `You are a cycling coach giving a daily check-in. Look at what the athlete did yesterday, what is on today, and what is coming tomorrow, then write a single short paragraph of human feedback.

Rules:
- Focus on sustainability: are they rested enough, is the load manageable, is recovery in place?
- Maximum 3 sentences. Plain prose, no bullet points.
- Be direct and warm — like a trusted coach, not a robot.
- If there is a risk or imbalance, name it plainly and say what to adjust.
- Never say "great job" generically. Never use the word "journey". Never moralise.`

function todayDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const CACHE_PREFIX = 'claude_feedback_'

export function getCachedFeedback(athleteId) {
  const today = todayDateStr()
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${athleteId}`)
    if (!raw) return null
    const { date, text } = JSON.parse(raw)
    return date === today ? text : null
  } catch {
    return null
  }
}

export function cacheFeedback(athleteId, text) {
  localStorage.setItem(
    `${CACHE_PREFIX}${athleteId}`,
    JSON.stringify({ date: todayDateStr(), text })
  )
}

export async function generateFeedback({ ftp, goal, threeDay }) {
  const lines = []

  if (ftp) lines.push(`Athlete FTP: ${ftp}W`)
  if (goal?.type === 'ftp' && goal.ftpTarget) {
    lines.push(`Goal: reach FTP ${goal.ftpTarget}W by ${goal.targetDate || 'unset date'}`)
  } else if (goal?.type === 'distance' && goal.distanceTarget) {
    lines.push(`Goal: complete a ${goal.distanceTarget}km ride by ${goal.targetDate || 'unset date'}`)
  }

  function describeDay(label, day) {
    if (!day) return
    const parts = []
    if (day.activities?.length) {
      day.activities.forEach(a => {
        const p = [a.type, a.duration]
        if (a.tss) p.push(`TSS ${a.tss}`)
        parts.push(p.join(', '))
      })
      lines.push(`${label}: ${parts.join(' + ')} (completed)`)
    } else if (day.plan) {
      lines.push(`${label}: ${day.plan.label} planned — ${day.plan.duration}min, ${day.plan.intensity}`)
    } else {
      lines.push(`${label}: rest`)
    }
  }

  describeDay('Yesterday', threeDay?.yesterday)
  describeDay('Today', threeDay?.today)
  if (threeDay?.tomorrow?.plan) {
    lines.push(`Tomorrow: ${threeDay.tomorrow.plan.label} planned — ${threeDay.tomorrow.plan.duration}min, ${threeDay.tomorrow.plan.intensity}`)
  } else {
    lines.push('Tomorrow: rest')
  }

  const userMessage = lines.join('\n')

  const res = await fetch('/api/claude-feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemPrompt: SYSTEM_PROMPT, userMessage }),
  })

  if (!res.ok) {
    let errMsg = 'Feedback request failed'
    try { errMsg = (await res.json()).error ?? errMsg } catch {}
    throw new Error(errMsg)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text
  if (!text) throw new Error('Empty response from Claude')
  return text
}

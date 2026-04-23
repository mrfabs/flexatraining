// claudeFeedback.js — Claude API integration for coaching feedback

const SYSTEM_PROMPT = `You are a cycling performance coach. Your job is to give the athlete honest, direct, specific feedback on whether their training is on track toward their goal.

Rules:
- Be direct and honest. You are a performance coach and a best friend combined — not brutal, but never soft.
- Write in plain prose. No bullet points. 3–5 sentences maximum.
- Name the arithmetic when the numbers tell a story — good or bad.
- Never say "great job" generically. Be specific about what the numbers actually show.
- If training is consistent and progress is clear, say so and say what it means for the goal.
- If there is a risk, name it plainly and tell the athlete what would fix it.
- Never use the word "journey". Never moralise.`

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

export async function generateFeedback({ ftp, weight, wkg, goal, recentActivities, weekSummary, profile }) {
  const lines = []

  lines.push('## Athlete metrics')
  lines.push(`FTP: ${ftp ? `${ftp}W` : 'not yet detected'}`)
  lines.push(`Weight: ${weight ? `${weight}kg` : 'not connected'}`)
  lines.push(`W/kg: ${wkg ? wkg : 'not available'}`)

  lines.push('\n## Goal')
  if (goal?.type === 'ftp') {
    lines.push(`Target: FTP ${goal.ftpTarget}W by ${goal.targetDate || 'unset date'}`)
    if (goal.startFtp && goal.ftpTarget && ftp) {
      const pct = Math.round(((ftp - goal.startFtp) / (goal.ftpTarget - goal.startFtp)) * 100)
      lines.push(`Progress: ${Math.max(0, pct)}% of the way from ${goal.startFtp}W to ${goal.ftpTarget}W`)
    }
  } else if (goal?.type === 'distance') {
    lines.push(`Target: Complete a ${goal.distanceTarget}km ride by ${goal.targetDate || 'unset date'}`)
  } else {
    lines.push('No goal set yet.')
  }

  lines.push('\n## Recent activities (last 14 days)')
  if (recentActivities.length === 0) {
    lines.push('No activities recorded in the past 14 days.')
  } else {
    recentActivities.forEach(a => {
      const parts = [a.date, a.type, a.duration]
      if (a.np) parts.push(`${a.np}W NP`)
      if (a.tss) parts.push(`TSS ${a.tss}`)
      lines.push(`- ${parts.join(' · ')}`)
    })
  }

  lines.push('\n## Weekly training load')
  lines.push(`This week: ${weekSummary.thisWeek.sessions} session${weekSummary.thisWeek.sessions !== 1 ? 's' : ''}, TSS ${weekSummary.thisWeek.tss}`)
  lines.push(`Last week: ${weekSummary.lastWeek.sessions} session${weekSummary.lastWeek.sessions !== 1 ? 's' : ''}, TSS ${weekSummary.lastWeek.tss}`)

  if (profile) {
    lines.push('\n## Training profile')
    if (profile.weeklyHours) lines.push(`Stated weekly availability: ${profile.weeklyHours} hours`)
    if (profile.lifeContext) lines.push(`Life context: ${profile.lifeContext}`)
    if (profile.structureRelationship) lines.push(`Relationship with structure: ${profile.structureRelationship}`)
    if (profile.disciplineGoal) lines.push(`Discipline goal: ${profile.disciplineGoal}`)
    if (profile.nonNegotiables?.length) {
      lines.push(`Non-negotiables: ${profile.nonNegotiables.join(', ')}`)
    }
  }

  lines.push('\nWrite your coaching comment now.')

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

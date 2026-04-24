export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end('Method Not Allowed')
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })
    return
  }

  const { markdown, today } = req.body
  if (!markdown || typeof markdown !== 'string') {
    res.status(400).json({ error: 'markdown is required' })
    return
  }

  const systemPrompt = `You parse training plans from Markdown into structured JSON.
Today's date is ${today || new Date().toISOString().split('T')[0]}.

Given a training plan in any Markdown format, extract each training session and return a JSON object keyed by ISO date strings (YYYY-MM-DD). Only include days that have training sessions — omit rest days entirely.

Each session must have these fields:
- label: short session name (string)
- duration: duration in minutes as a number (number)
- intensity: one of "easy", "moderate", or "hard" (string)
- description: one or two sentence description of the workout objective (string)

Return ONLY valid JSON — no markdown fences, no preamble, no explanation. Example output:
{"2026-05-01":{"label":"Threshold intervals","duration":60,"intensity":"hard","description":"4x8min at threshold power with 4min recovery. Builds sustained power."},"2026-05-03":{"label":"Easy spin","duration":45,"intensity":"easy","description":"Recovery ride at low effort. Keep heart rate below zone 2."}}`

  const userMessage = `Parse this training plan:\n\n${markdown}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      res.status(response.status).json({ error: errText })
      return
    }

    const data = await response.json()
    const text = (data.content?.[0]?.text || '').trim()

    let plan
    try {
      plan = JSON.parse(text)
    } catch {
      res.status(422).json({ error: 'Could not parse the plan. Check the file format and try again.' })
      return
    }

    const sessionCount = Object.keys(plan).length
    if (sessionCount === 0) {
      res.status(422).json({ error: 'No training sessions found in the file. Make sure it includes dated sessions.' })
      return
    }

    res.json({ plan })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

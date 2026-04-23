import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function claudeApiPlugin() {
  return {
    name: 'claude-api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/claude-feedback', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        const chunks = []
        req.on('data', chunk => chunks.push(chunk))
        req.on('end', async () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString())
            const apiKey = process.env.ANTHROPIC_API_KEY

            if (!apiKey) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in .env' }))
              return
            }

            const response = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-sonnet-4-6',
                max_tokens: 250,
                system: [
                  {
                    type: 'text',
                    text: body.systemPrompt,
                    cache_control: { type: 'ephemeral' },
                  },
                ],
                messages: [{ role: 'user', content: body.userMessage }],
              }),
            })

            if (!response.ok) {
              const errText = await response.text()
              res.statusCode = response.status
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: errText }))
              return
            }

            const data = await response.json()
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(data))
          } catch (err) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: err.message }))
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), claudeApiPlugin()],
})

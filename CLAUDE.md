# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

---

## Filesystem Access — Hard Boundary

**Claude is strictly prohibited from accessing any file, folder, or resource outside this repository root.**

This is a non-negotiable rule. No exceptions. No fallbacks. No workarounds.

### What is forbidden
- Reading any file outside this repository
- Writing or editing any file outside this repository
- Running Bash commands that navigate outside the repository root (e.g. `cd ..`, `cd ~`, `cd /`)
- Accessing `~/.claude/`, `~/.ssh/`, `~/.aws/`, or any other home directory config or credential folder
- Reading global settings, environment files, or system paths
- Using absolute paths that resolve outside the project root

### If a task seems to require going outside this boundary
- Stop and tell the user explicitly
- Do not attempt a workaround
- Ask the user to bring the relevant content into this repository instead

---

## Project Overview

Flexatraining — a cycling performance web app (React + Vite) that helps athletes train toward their goals. Deployed on Vercel. Backend via Supabase. AI coaching feedback via Claude API.

This repository contains both the app code (`prototype/`) and all strategy and product thinking (`strategy/`). Strategic conversations belong here — no need to go elsewhere.

### Tech Stack
- Frontend: React 18, Vite
- Deployment: Vercel (serverless functions in `api/`)
- Database: Supabase (Postgres + RLS)
- External APIs: Strava, Withings, Anthropic Claude
- Design: Figma

### Key Files
- `prototype/src/Dashboard.jsx` — main screen
- `prototype/src/claudeFeedback.js` — Claude API coaching feedback (client-side)
- `prototype/api/claude-feedback.js` — Vercel serverless function (proxies to Anthropic API)
- `prototype/src/auth.js` — Strava OAuth
- `prototype/src/withings.js` — Withings OAuth + weight fetch
- `prototype/src/ftp.js` — FTP auto-detection from Strava power data
- `prototype/src/plan.js` — planned session logic
- `prototype/vercel.json` — Vercel build config (Vercel root directory: `prototype/`)
- `strategy/` — product requirements and strategy docs

### Environment Variables
All required vars are documented in `prototype/.env.example`. Never commit `prototype/.env`.

- `ANTHROPIC_API_KEY` — server-side only, used in `api/claude-feedback.js`
- `VITE_STRAVA_CLIENT_ID` / `VITE_STRAVA_CLIENT_SECRET` — Strava OAuth
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Supabase client
- `VITE_WITHINGS_CLIENT_ID` / `VITE_WITHINGS_CLIENT_SECRET` — Withings OAuth

---

## Security Rules

- Never log or expose `ANTHROPIC_API_KEY`, client secrets, or tokens in client-side code
- `VITE_` prefixed vars are bundled into the frontend — treat them as public
- Strava and Withings client secrets are currently in `VITE_` vars (prototype caveat — move to serverless functions before any public launch)
- Never use `dangerouslySetInnerHTML` or equivalent
- Always validate and sanitise at API boundaries

---

## Behavior Rules

- Read all content and instructions silently before responding or running commands
- Never answer mid-reading — complete full context before acting
- Do not add features, refactor, or make improvements beyond what was asked
- Do not add comments or docstrings to code you did not change
- Write prose like a non-fiction writer. Never use double hyphens (--). Use commas, colons, and semicolons where pauses are needed. Em dashes (—) may be used sparingly.

---

## Defining Tangible Goals

When setting goals, every strong goal needs four numbers:

1. A target — where you want to reach
2. A baseline — where you are now
3. A trend — current velocity (improving or deteriorating?)
4. A timeframe — the bound within which change is expected

Do not accept vague targets. Push for the four numbers before treating any goal as real.

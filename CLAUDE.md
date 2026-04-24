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

### Local Development

```bash
cd prototype && npm run dev
```

Opens at `http://localhost:5173`. Requires a populated `prototype/.env` — copy from `prototype/.env.example` and fill in values.

There are no automated tests. Verify changes by running the app and exercising the affected flow manually.

### Database

Schema and RLS policies live in the Supabase dashboard (no migration files in this repo yet). Before making any data-layer changes, check the current table structure in Supabase directly. If you add or modify tables, document the schema change here or in a new `prototype/schema.sql` file.

### Strategy Docs

`strategy/` contains versioned product and requirements documents:
- Files named `*-v1.md`, `*-v2.md` etc. are stable snapshots
- Files with `(wip)` in the name are active drafts — treat them as current
- Always read the highest version + any wip file before making product decisions

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
- Never use `dangerouslySetInnerHTML` or equivalent
- Always validate and sanitise at API boundaries

> **Known risk:** `VITE_STRAVA_CLIENT_SECRET` and `VITE_WITHINGS_CLIENT_SECRET` are currently exposed in the frontend bundle. This is acceptable for the prototype but must be moved to serverless functions before any public launch. Do not normalise this pattern — flag it if you see it spreading.

---

## Branching and Git

- `main` is the production branch — always deployable, connected to Vercel
- Branch naming: `feature/short-description` for new work, `fix/short-description` for bug fixes
- All changes go through a PR targeting `main` — no direct commits to `main`
- Commit messages: imperative tense, one line for small changes, a short body for anything non-obvious

---

## Behavior Rules

- Read all content and instructions silently before responding or running commands
- Never answer mid-reading — complete full context before acting
- Do not add features, refactor, or make improvements beyond what was asked
- Do not add comments or docstrings to code you did not change
- Write prose like a non-fiction writer. Never use double hyphens (--). Use commas, colons, and semicolons where pauses are needed. Em dashes (—) may be used sparingly.

---

## Product Thinking — Full Flow Responsibility

**Always consider the whole product flow before touching any screen.**

When making changes to a UI screen (dashboard, stats, profile), check whether those changes require corresponding updates in:
- Onboarding: does the data this screen needs get collected during onboarding? If not, add the collection step.
- Data layer (localStorage / Supabase): is the data being saved and loaded consistently across screens?
- Other screens that share the same data: if you change what a field means or how it's stored, update every screen that reads it.

Never ship a stats or dashboard improvement that relies on data that onboarding doesn't yet collect or save correctly. Think end-to-end before writing a single line.

---

## Defining Tangible Goals

When setting goals, every strong goal needs four numbers:

1. A target — where you want to reach
2. A baseline — where you are now
3. A trend — current velocity (improving or deteriorating?)
4. A timeframe — the bound within which change is expected

Do not accept vague targets. Push for the four numbers before treating any goal as real.

---

## Session Management

- At the start of every conversation, read `open-threads.md` and surface any active threads to the user before doing anything else. Keep it brief: one line per thread, what it is and where it was left.
- When the user types `/leaving`, run the leaving skill: update `open-threads.md` to reflect what was done and what comes next, run `/save`, then close with `/exit`.

# KathaCharts Marketing Agent V3.2 FINAL

A traffic-first, controlled-aggressive revenue command center for KathaCharts.

## Operating loop

**Hunt → Score → Prepare → Approve → Execute → Follow-up → Measure → Re-hunt**

The engine keeps hunting after the ₹5,000 survival floor is reached. The floor is not a ceiling.

## What is included

- Survival state: CRITICAL / STABLE / HIGH GROWTH
- Revenue opportunity scoring by expected value, probability, speed and cost
- Background revenue hunting every 30 minutes (configurable; minimum 10 minutes)
- Approval-ready revenue action queue
- Execution package preparation after approval
- 48-hour follow-up preparation
- Realized revenue recording linked to actions
- Automatic re-hunting after revenue is recorded
- Multilingual AI campaign generation with fallback mode
- Public/consented lead capture
- Production admin-key protection for all write actions
- Render deployment blueprint

## Important execution boundary

This agent is aggressive about **finding, prioritizing and preparing** legitimate revenue opportunities. It does not automatically send DMs/emails, publish content, spend money, impersonate people, scrape private data or make commercial commitments.

## Local run

1. `npm install`
2. Copy `.env.example` to `.env`
3. For local use, `AGENT_ADMIN_KEY` can be left blank if `NODE_ENV` is not `production`.
4. `npm start`
5. Open `http://localhost:3100`

## Render deployment

Use the included `render.yaml` as the Blueprint. Set `AGENT_ADMIN_KEY` to a long random secret and optionally set `OPENAI_API_KEY`.

After deployment, enter the same admin key in the dashboard. Never put the key into source code or commit a `.env` file.

## Data

The demo/local state is stored in `agent-data.json`. On a hosting service with ephemeral storage, use a persistent disk or move the data layer to a managed database before relying on it for long-term production records.

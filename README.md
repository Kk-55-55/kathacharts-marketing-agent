# KathaCharts Marketing Agent V3.3 — Semi-Autonomous

Traffic-first marketing and revenue-survival engine for KathaCharts.

## Real operating loop

**Hunt → Score → Draft → Approve → Execute through official APIs → Track → Follow-up → Measure → Re-hunt**

### Channel rules
- **Pratilipi:** research/opportunity source only; no browser bot, scraping, bulk follow, or automated outreach.
- **Instagram:** official Meta API publishing for Professional accounts.
- **Facebook:** official Meta Page API publishing.
- **X:** official X API publishing using user-authorized OAuth credentials.
- No fake execution: if credentials or permissions are missing, the action is recorded as FAILED/blocked instead of being marked published.

## Semi-autonomous approval model

You remain the approver for important external actions. Once a draft is approved, `AUTO_PUBLISH=true` lets the background agent publish to the configured official channels automatically. The agent records the external post ID/status and continues hunting.

Direct outreach, paid spend, sensitive commitments and unsupported platforms remain approval/manual unless a specific compliant API adapter is added.

## Traffic measurement

The agent has a traffic-event store (`/api/traffic/event`) for campaign/source events and channel execution history. Existing KathaCharts GA4 remains the primary website analytics layer; a future GA4 Reporting API connector can pull GA4 results directly into the agent when service credentials are supplied.

## Required environment variables

See `.env.example`.

### Meta
For Instagram publishing, the account must be an Instagram Professional account and the required Meta permissions/tokens must be authorized. Instagram image publishing requires a publicly reachable HTTPS image URL.

### X
Use X user-authorized OAuth 1.0a credentials with write access. The agent signs requests server-side and never exposes the secrets to the browser.

## Local run

```bash
npm install
npm start
```

Open `http://localhost:3100`.

## Production

Set a strong `AGENT_ADMIN_KEY`. Keep API credentials in Render environment variables, never in source control. Use persistent storage for `agent-data.json` or move state to a managed database before relying on it for long-term production records.


## Instagram Login API support (V3.3.1 patch)
The agent now supports Meta's Instagram Login route directly. Set `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`, and a public HTTPS `INSTAGRAM_IMAGE_URL`; the legacy Facebook Page token route remains available as a fallback. Instagram publishing uses the official Instagram API and requires the appropriate content-publishing permission. Do not paste tokens into chat.

# LaHaze Marketing HQ

The Marketing HQ tracker (project board, Briefing, Approvals, Requests, Updates, Vendors) as a small Vercel app.
No build step and no dependencies: `public/` is the page, `api/data.js` is the one serverless function.

## Deploy on Vercel

1. In Vercel, **Add New → Project**, import this GitHub repo, and click **Deploy** (framework preset: Other, no settings to change).
2. In the project, open **Storage → Create Database → Upstash for Redis** (free plan), and connect it to this project.
   Vercel adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you.
3. Optional but recommended for a public link: **Settings → Environment Variables**, add `EDIT_KEY` with a passcode.
   Everyone can view; only people who enter the passcode (footer: "Unlock editing") can change things.
4. **Deployments → Redeploy** so the new variables take effect.

On first load with storage connected, the app seeds itself from `lib/seed.js` (16 projects and 6 key dates exported
from the original artifact). Until storage is connected the site runs in preview mode and edits stay in that browser only.

## Data

Each collection is a Redis hash `hq:<collection>` holding one JSON document per id. Open tabs refresh every 20 seconds.

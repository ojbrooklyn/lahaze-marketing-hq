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

## Project assistant (chat)

The "Ask about a project" button opens a chat that answers questions from the live board data. It is read-only:
it has no tools and can't change anything. It runs on Claude (`claude-opus-5-5`, low effort, short answers).

- Set `ANTHROPIC_API_KEY` in the project's environment variables and redeploy. Without it the button stays hidden.
- Limits, because the page is public: 20 questions per visitor per hour (`CHAT_LIMIT_PER_HOUR`) and 500 per day
  across all visitors (`CHAT_LIMIT_PER_DAY`). Counters live in the same Redis database.
- Optional: `CHAT_MODEL` to use a different Claude model.

## Project pages

Select any card to open its project page: docs and files (newest dated version marked Latest), email threads,
linked projects with their latest doc, status updates, approvals and vendor threads for that project.
With editing unlocked, "Add a doc or link" attaches any https link (Google Drive, Canva, Gmail, Dropbox...).
The list is visible to anyone with the board link; the files themselves keep their own sharing settings.

## Categories and priority

Each project has a category (Direct marketing, Digital marketing, Operations, Membership, Subscriptions,
Collaboration, Refresh website & GBP) and an optional priority (High, Medium, Low). The board filters by both, the
list view groups by category, and the Briefing shows the top open priorities. Drag cards up and down within a column
to set their order.

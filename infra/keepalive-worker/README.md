# Showzy keep-alive Worker

Pings the API every 10 minutes so the free Render service never goes to sleep.
See the comment at the top of `index.js` for why it must hit the API and not the website.

## Connect it to Cloudflare (Workers & Pages → showzy-cron → Settings → Build)

| Setting | Value |
|---|---|
| Git repository | this repo, branch `main` |
| **Root directory** | `infra/keepalive-worker` |
| Build command | *(leave empty)* |
| Deploy command | `npx wrangler deploy` |
| Build watch paths (include) | `infra/keepalive-worker/*` |

The Worker's name in the dashboard must be `showzy-cron`, the same as `name` in `wrangler.jsonc`.

## Settings live in `wrangler.jsonc`, not the dashboard

Once a Worker deploys from Git, `wrangler.jsonc` is the source of truth: variables and
cron triggers typed into the dashboard are replaced on the next deploy, and edits made in
the dashboard code editor are overwritten by the repo's version. Change things here and push.

- `API_BASE` – the API's Render address, no trailing slash.
- `ARTIST_ID` – optional artist id whose profile is fetched too (touches the database).
- `triggers.crons` – every 10 minutes. Keep it under 15: Render sleeps after 15 idle minutes.

## Check it works

- Open `https://showzy-cron.<your-subdomain>.workers.dev/?run=1` → expect `200` and `ok: true`.
- Render logs show `GET /api/v1/health/` about every 10 minutes.
- `node smoke.mjs` runs the local checks.

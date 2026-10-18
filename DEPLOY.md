# Deploying Showzy

This is the complete, start-to-finish guide to putting Showzy on the internet.
It assumes you have never deployed anything before. Every command is one you
can copy and paste.

Read it in order. It takes about 90 minutes the first time.

---

## Contents

1. [Before you start: one thing is broken](#0-before-you-start-one-thing-is-broken)
2. [What you are actually deploying](#1-what-you-are-actually-deploying)
3. ["Can Django run on Supabase?" — the honest answer](#2-can-django-run-on-supabase--the-honest-answer)
4. [Where to host it, and what it costs](#3-where-to-host-it-and-what-it-costs)
5. [Step A — the database on Supabase](#step-a--the-database-on-supabase)
6. [Step B — the backend on Render](#step-b--the-backend-on-render)
7. [Step C — the frontend](#step-c--the-frontend)
8. [Did it work? A checklist](#did-it-work-a-checklist)
9. [When it goes wrong](#when-it-goes-wrong)
10. [When Razorpay is approved](#when-razorpay-is-approved)
11. [Running the whole thing on your own laptop](#appendix--running-the-whole-thing-on-your-own-laptop)
12. [Every environment variable, in one table](#appendix--every-environment-variable)

---

## 0. Before you start: where things stand

Everything in this guide works today. Both halves are green:

```bash
cd /Users/apple/Desktop/NADDA/dev/Naada

npm run build --workspace @naada/frontend   # produces the website files
npm test     --workspace @naada/frontend    # 91 tests, all passing

cd apps/backend
DJANGO_ENV=naada.settings.local .venv/bin/python manage.py test   # 232 tests, all passing
```

There is also an end-to-end check that exercises a running server rather than
the pieces in isolation — sign in, browse, order, pay, verify the payment
signature, collect the ticket, pull the invoice, cancel for a refund:

```bash
python3 apps/backend/tools/smoke_test.py            # against local dev
python3 apps/backend/tools/smoke_test.py https://…  # against a deploy
```

Run it after any deploy. It is the fastest way to tell "the site is up" from
"the site works". Read the file's own header first — against a live site it
buys a real ticket and refunds it.

Two things to know before you begin, because they surprise people:

**Payments run on a stand-in.** Showzy has no Razorpay merchant account yet, so
the app uses a mock gateway. Orders, inventory, signature checks, ticket
issuing and QR codes are all completely real — only the money is simulated.
Nothing needs rewriting when the account is approved; see *When Razorpay is
approved* near the end. You can deploy and take the product through its whole
flow today.

**Sign-in codes appear in the logs, not in an inbox,** until you set the email
variables in Step B4. That is deliberate for a first deploy.

---

## 1. What you are actually deploying

Showzy is not one program. It is five things that must all be running:

| Piece | What it does | What happens if it's missing |
|---|---|---|
| **Web (Django/daphne)** | Serves the API and the chat WebSocket | Nothing works |
| **Celery worker** | Runs background jobs | Escrowed artist payouts never auto-release |
| **Celery beat** | The alarm clock that starts the nightly job | Nightly reconciliation never runs |
| **Redis** | Message passing + the job queue | Worker has nothing to read from; chat can't fan out across servers |
| **Postgres** | All your data | Nothing works |
| **Frontend** | The website people actually see | No website |

The web process must be **ASGI** (we use `daphne`), not a normal WSGI server.
Django Channels serves `/ws/chat/<id>/` over a WebSocket, and WSGI has no
concept of a WebSocket. A gunicorn-only deploy answers that URL with a 404 and
chat silently never connects.

> Worth knowing: the React app doesn't open that WebSocket *yet* — today it talks
> to the API over ordinary HTTP. So if the WebSocket were broken you would not
> notice from the website. Deploy it correctly anyway; the endpoint exists, and
> the day someone wires up live chat you do not want to be re-platforming.

Payments run through a **built-in mock gateway**. You do not need a Razorpay
account to deploy, to demo, or to run a full booking-and-ticketing flow. No real
money moves. See [When Razorpay is approved](#when-razorpay-is-approved).

---

## 2. "Can Django run on Supabase?" — the honest answer

**No. Supabase cannot host Django, and it never has been able to.**

This is not a limitation you can work around with the right settings. Supabase
does not offer general application or container hosting at all. Its published
architecture is a fixed set of components:

| Supabase component | What it is |
|---|---|
| Postgres | The database |
| GoTrue | Their own login/auth service |
| PostgREST | Auto-generated REST API over your tables |
| Realtime | WebSocket engine for database change streams |
| Storage | S3-compatible file storage |
| **Edge Functions** | **Small serverless functions — Deno, JavaScript/TypeScript only** |
| Supavisor | Connection pooler |
| Studio | The web dashboard |

The only place Supabase runs your code is Edge Functions, and that runtime is
Deno. It executes JavaScript and TypeScript. It does not execute Python, it
cannot import Django, and even if it could, Edge Functions are short-lived
request handlers — they cannot host a Celery worker or a scheduler that has to
stay running.

*(Source: [Supabase architecture](https://supabase.com/docs/guides/getting-started/architecture),
[Edge Functions](https://supabase.com/docs/guides/functions).)*

### So what is Supabase for, here?

**Supabase is your Postgres database, and nothing else.** That is a genuinely
good use of it — you get a managed, backed-up Postgres with a nice dashboard,
free to start. Django connects to it over a normal Postgres connection string.

You could later also use Supabase Storage for uploaded photos (the code already
supports it — see `AWS_*` in the variable table), but you don't need to.

You are **not** using Supabase Auth. Showzy has its own user model, its own
OTP login and its own JWT tokens. Ignore that part of the dashboard.

### And Cloudflare? Can Django run there?

**Partially, and not for this app.**

As of 2 September 2026 Cloudflare's Python Workers do support WSGI and ASGI
frameworks including Django
([changelog](https://developers.cloudflare.com/changelog/post/2026-09-02-python-workers-web-framework-support/)).
But Python Workers are still in open beta and require the `python_workers`
compatibility flag
([docs](https://developers.cloudflare.com/workers/languages/python/)), the
Python packages available are a curated set built on Pyodide/WebAssembly — which
is a poor fit for `psycopg2-binary`, `daphne`, `channels-redis` and `celery` —
and a Worker is a request handler. It cannot be your always-on Celery worker or
your beat scheduler.

Cloudflare **Containers** (available on the Workers Paid plan) can run an
arbitrary image, but by design **containers sleep after 10 minutes of
inactivity** and cold-start in 1–3 seconds
([lifecycle docs](https://developers.cloudflare.com/containers/platform-details/)).
A background worker that sleeps is not a background worker.

**Use Cloudflare for what it's excellent at: DNS, and hosting the frontend on
Cloudflare Pages (free).** The repo already has
`apps/frontend/public/_redirects` set up for exactly that. Don't put Django
there.

---

## 3. Where to host it, and what it costs

This app needs three always-on processes plus Redis. That single fact rules out
most of the cheap "deploy in one click" options, which assume one web process
and nothing else.

### Recommended: **Render**

Render is the recommendation because it is the only one of the options that
models this app's shape directly. It has a first-class **Background Worker**
service type, so the Celery worker and beat scheduler are not hacks — they are
just services. It gives you free Redis and free static-site hosting. And the
entire setup is already written down in `apps/backend/render.yaml`, so you create
it in one click instead of clicking through five dashboards.

**Cost, roughly, per month:**

| Service | Plan | Cost |
|---|---|---|
| `naada-api` (web) | Starter, 0.5 CPU / 512 MB | **$7** |
| `naada-worker` (Celery) | Starter | **$7** |
| `naada-beat` (scheduler) | Starter | **$7** |
| `naada-redis` (Key Value) | Free (25 MB, no persistence) | $0 |
| `naada-web` (frontend) | Static site | $0 |
| Supabase Postgres | Free | $0 |
| **Total** | | **≈ $21/month** |

> **Cheaper, if you want:** you can drop `naada-beat` and run the scheduler
> inside the worker by changing the worker's command to
> `celery -A naada worker --beat --loglevel=info --concurrency=2`. That saves
> $7/month. It is only safe while you run **exactly one** worker instance — two
> would each run the nightly job. Switch back to a separate `naada-beat` before
> you scale up.

Render's free tier can't be used for the API: free web services
**spin down after 15 minutes of inactivity** and take about a minute to wake up,
and the pre-deploy step that runs your database migrations is
[paid-plans-only](https://render.com/docs/deploys#pre-deploy-command).

Pick the **Singapore** region. It is the closest Render region to Mysuru and
Bengaluru.

### Alternative: **Railway**

Railway is the good second choice, and probably a little cheaper at low traffic
because it bills by actual usage per second rather than a flat fee per service.
The Hobby plan is $5/month including $5 of usage credit, then roughly
$10/GB-month of RAM and $20/vCPU-month
([pricing](https://railway.com/pricing)). Three small idle services plus Redis
realistically lands around **$12–18/month**.

Railway handles everything this app needs — private networking between services,
a one-click Redis, WebSockets, and cron schedules
([docs](https://docs.railway.com/guides/cron-workers-queues)). The catch is
setup effort: **one `railway.json` configures only one service**, so
`apps/backend/railway.json` covers the web process and you have to create the
worker, beat and Redis services by hand in the dashboard, each pointing at the
same repo with a different start command.

If you go this way, set each backend service's **Root Directory** to
`apps/backend` — `railway.json` says `"dockerfilePath": "Dockerfile"`, which is
resolved relative to that root. Start commands:

| Service | Start command |
|---|---|
| web | `daphne -b 0.0.0.0 -p $PORT --proxy-headers naada.asgi:application` |
| worker | `celery -A naada worker --loglevel=info --concurrency=2` |
| beat | `celery -A naada beat --loglevel=info --schedule=/tmp/celerybeat-schedule` |

Set `REDIS_URL` to `redis://default:${{Redis.REDIS_PASSWORD}}@redis.railway.internal:6379`
(Railway's private network), and set every variable from the
[table below](#backend) on all three services.

### Not recommended for this app

- **Fly.io** — capable, and cheap, but you manage `fly.toml`, volumes and
  machine states yourself. More knobs than you want right now.
- **Vercel / Netlify / Cloudflare Workers for the backend** — serverless. No
  always-on worker, no scheduler process, awkward WebSockets.
- **Heroku** — works fine, costs noticeably more.

The rest of this guide uses **Supabase + Render**. If you choose Railway, the
Supabase section and the environment variables are identical; only Step B
changes.

---

## Step A — the database on Supabase

### A1. Create the project

1. Go to <https://supabase.com>, sign up, click **New project**.
2. Name it `naada`.
3. **Region: `ap-south-1` (Mumbai).** Closest to your users. You cannot change
   this later without recreating the project.
4. Set a database password. **Copy it into your password manager now.** Supabase
   shows it once. Avoid `@`, `/`, `:` and `#` in it — those characters have
   special meaning inside a connection string and will break it. Letters and
   digits only is safest.
5. Wait about two minutes for it to finish provisioning.

### A2. Get the connection string — and pick the right one

This is the single most common thing people get wrong. Read this bit carefully.

In your project, click **Connect** at the top of the dashboard. You will be
offered several connection strings. They are not interchangeable:

| Option | Looks like | Port | Reachable over |
|---|---|---|---|
| **Direct connection** | `postgresql://postgres:PW@db.<ref>.supabase.co:5432/postgres` | 5432 | **IPv6 only** on the free plan |
| **Session pooler** ← *use this* | `postgresql://postgres.<ref>:PW@aws-1-ap-south-1.pooler.supabase.com:5432/postgres` | 5432 | IPv4, every plan |
| **Transaction pooler** | `postgresql://postgres.<ref>:PW@aws-1-ap-south-1.pooler.supabase.com:6543/postgres` | 6543 | IPv4, every plan |

**Use the Session pooler string.** Two reasons:

1. **Render has no outbound IPv6.** The "Direct connection" hostname
   (`db.<ref>.supabase.co`) resolves only to an IPv6 address on the free plan, so
   a Render service simply cannot reach it. You would get a connection timeout
   that looks like the database is down. The pooler hostname
   (`...pooler.supabase.com`) is IPv4 on every plan.
   (Fixing this the other way costs money: Supabase sells an
   [IPv4 add-on](https://supabase.com/docs/guides/platform/ipv4-address).)
2. **Django is a long-running server, not a serverless function.** Session mode
   gives each of your processes a real, persistent Postgres session. Transaction
   mode (port 6543) hands the connection back after every single statement and
   does not support prepared statements — it exists for serverless and edge
   functions that open thousands of one-shot connections.
   ([Supabase docs](https://supabase.com/docs/guides/database/connecting-to-postgres))

Note the username differs: the pooler needs `postgres.<your-project-ref>`, not
plain `postgres`. Copy the string from the dashboard rather than assembling it
by hand, then paste your password in where it says `[YOUR-PASSWORD]`.

> **The code already knows about this.** `apps/backend/naada/settings/base.py`
> looks at the port. Port 6543 → it switches off persistent connections and
> server-side cursors, because that's what a transaction pooler requires. Any
> other port → it keeps connections alive for 60 seconds and enables health
> checks. You don't configure this; just give it the right URL. Every non-SQLite
> URL also gets `sslmode=require` automatically — Supabase refuses unencrypted
> connections.

> **Already verified from this machine.** Pointing the production settings at
> `aws-0-ap-south-1.pooler.supabase.com:5432` resolved DNS, negotiated TLS and
> reached Supabase's pooler, which answered with its own
> `no tenant identifier provided` error — the expected reply to a made-up
> username. In other words the driver, the SSL mode and the host are all
> correct; the only missing piece is your project's real connection string.
> Production settings were confirmed to resolve as: PostgreSQL engine,
> `sslmode=require`, `CONN_MAX_AGE=60`, `DEBUG=False`, OTP codes never returned
> in API responses, WhiteNoise active.

### A3. Run the migrations

Migrations create the tables. Nothing works until you've done this once, and you
must do it again after every deploy that changes the database (Render will do
that part for you automatically — see Step B).

From your laptop:

```bash
cd /Users/apple/Desktop/NADDA/dev/Naada/apps/backend

DJANGO_ENV=naada.settings.production \
SECRET_KEY="$(.venv/bin/python -c 'import secrets;print(secrets.token_urlsafe(64))')" \
DATABASE_URL="postgresql://postgres.YOURREF:YOURPASSWORD@aws-1-ap-south-1.pooler.supabase.com:5432/postgres" \
ALLOWED_HOSTS="localhost" \
.venv/bin/python manage.py migrate
```

Replace `YOURREF` and `YOURPASSWORD`. You should see a long list of lines ending
in `OK`.

> **Why `.venv/bin/python manage.py` and not just `python manage.py`?** The
> virtualenv in `apps/backend/.venv` has stale shebang lines in its console
> scripts — running `celery`, `daphne` or `gunicorn` directly on your Mac fails
> with a "bad interpreter" error. Calling the Python binary by its full path
> always works. For the same reason, run Celery locally as
> `.venv/bin/python -m celery -A naada worker` rather than `celery -A naada worker`.
> This is a quirk of your local checkout only — the deployed containers build a
> fresh virtualenv and are unaffected.

### A4. Seed the demo data (optional)

Fills the database with realistic events, artists and venues so the site isn't
empty when you show it to someone:

```bash
# same environment variables as above, then:
.venv/bin/python manage.py seed_data
```

### A5. Create your admin login

```bash
# same environment variables as above, then:
.venv/bin/python manage.py createsuperuser
```

### A6. Keep the project awake

Supabase pauses free projects after **one week without database activity**
([docs](https://supabase.com/docs/guides/platform/free-project-pausing)). In
practice this will not happen to you: Render polls `/api/v1/health/` constantly
and that endpoint runs a real `SELECT 1`. But if you tear the backend down for a
fortnight, expect to have to un-pause the project from the dashboard.

---

## Step B — the backend on Render

### B1. Move the blueprint to the repository root

Render only looks for a file named `render.yaml` at the **top level** of the
repository. Ours currently lives in `apps/backend/`. Copy it up:

```bash
cd /Users/apple/Desktop/NADDA/dev/Naada
cp apps/backend/render.yaml render.yaml
git add render.yaml
git commit -m "Add Render blueprint at repo root"
git push
```

### B2. Generate a SECRET_KEY

This signs your users' login tokens. It must be long, random, and never shared.

```bash
cd /Users/apple/Desktop/NADDA/dev/Naada/apps/backend
.venv/bin/python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Copy the output. **The same value must be used by the web service, the worker
and beat** — if they differ, a token signed by one is rejected by the other and
users get logged out at random. The blueprint's shared environment group handles
that for you.

> Production **refuses to start** if `SECRET_KEY` still looks like the built-in
> development default, and it refuses to start if `DATABASE_URL` points at
> SQLite. That is deliberate. If the service crashes on boot with
> `ImproperlyConfigured`, read the message — it is telling you exactly which of
> the two you forgot.

### B3. Create the blueprint

1. Go to <https://dashboard.render.com> → **New** → **Blueprint**.
2. Connect your GitHub account and pick the Showzy-Main repository.
3. Render reads `render.yaml` and shows you five services to be created:
   `naada-api`, `naada-worker`, `naada-beat`, `naada-redis`, `naada-web`.
4. It will prompt you for each value marked "sync: false". Fill them in as
   below.

### B4. Environment variables — backend (`naada-api`, `naada-worker`, `naada-beat`)

All three share one group, so you enter these once.

**Required — the deploy will not work without these:**

| Variable | Value |
|---|---|
| `DJANGO_ENV` | `naada.settings.production` *(already set in the blueprint)* |
| `SECRET_KEY` | The long random string from B2 |
| `DATABASE_URL` | Your Supabase **session pooler** string from A2 |
| `ALLOWED_HOSTS` | `naada-api.onrender.com,naada-web.onrender.com,127.0.0.1,localhost` |
| `CORS_ALLOWED_ORIGINS` | `https://naada-web.onrender.com` |
| `REDIS_URL` | *(the blueprint wires this from `naada-redis` automatically — don't type it)* |

**The two host variables are where deploys go to die. Get them exactly right:**

`ALLOWED_HOSTS` — **hostnames only.** No `https://`, no port, no trailing
slash, comma-separated, no spaces.
- ✅ `naada-api.onrender.com,naada-web.onrender.com,127.0.0.1`
- ❌ `https://naada-api.onrender.com` (scheme — Django will reject every request)
- ❌ `naada-api.onrender.com, 127.0.0.1` (the space becomes part of the hostname)

It must include:
- the API's own hostname (or Django rejects every request with `DisallowedHost`),
- `127.0.0.1` (the container's health probe calls itself on loopback),
- **and the frontend's hostname.** This last one surprises people. WebSocket
  connections are guarded by Channels' `AllowedHostsOriginValidator`, which
  checks the browser's `Origin` header against `ALLOWED_HOSTS`. Leave the
  frontend host out and HTTP works fine while WebSockets are silently refused.

`CORS_ALLOWED_ORIGINS` — **with `https://`, no trailing slash.** This must match
the address bar of the website exactly.
- ✅ `https://naada-web.onrender.com`
- ❌ `naada-web.onrender.com` (no scheme)
- ❌ `https://naada-web.onrender.com/` (trailing slash)

**Optional — leave every one of these blank and everything still works:**

| Variable | Leave blank unless… |
|---|---|
| `PAYMENT_GATEWAY` | Defaults to `mock`. Only set it when Razorpay is live. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Razorpay is approved |
| `SENTRY_DSN` | You want error alerts. Blank = silently disabled, never a crash. |
| `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` | You have real SMTP. **Blank means login OTP codes are printed to the Render logs instead of emailed** — fine for testing, not for real users. |
| `DEFAULT_FROM_EMAIL` | You set up SMTP |
| `AWS_STORAGE_BUCKET_NAME` + `AWS_*` | You want uploads on S3/Supabase Storage instead of the container's disk |
| `CSRF_TRUSTED_ORIGINS` | Defaults to the `https://` entries of `CORS_ALLOWED_ORIGINS` |

### B5. Custom domains, later

When you point `naada.live` at this, you must add the new names to both
variables and **redeploy the backend**, and change `VITE_API_BASE` and
**rebuild the frontend**:

```
ALLOWED_HOSTS=api.naada.live,naada.live,www.naada.live,127.0.0.1
CORS_ALLOWED_ORIGINS=https://naada.live,https://www.naada.live
```

### B6. What happens on each deploy

The blueprint's `preDeployCommand` runs `python manage.py migrate --noinput`
once per deploy, before the new version takes traffic. You do not have to run
migrations by hand again after Step A3.

Static files (`collectstatic`) are handled at **image build time** inside
`apps/backend/Dockerfile`. Do not remove that line — see the static-files entry
in [When it goes wrong](#when-it-goes-wrong).

---

## Step C — the frontend

> Do [step 0](#0-before-you-start-one-thing-is-broken) first. Until `npm run build`
> succeeds, nothing here can work.

The blueprint already creates `naada-web` as a free Render static site, which is
the simplest option — one dashboard, one repo, done. Cloudflare Pages and Vercel
are equally good and also free; config for both is already in the repo
(`apps/frontend/public/_redirects` and `apps/frontend/vercel.json`).

### C1. The one variable that matters

| Variable | Value |
|---|---|
| `VITE_API_BASE` | `https://naada-api.onrender.com/api/v1` |

Format rules — all three of these produce a blank page or "Failed to fetch":

- ✅ `https://naada-api.onrender.com/api/v1`
- ❌ `https://naada-api.onrender.com` — missing `/api/v1`
- ❌ `https://naada-api.onrender.com/api/v1/` — trailing slash
- ❌ `http://...` — the browser blocks it as mixed content

**`VITE_API_BASE` is baked into the JavaScript at build time.** Vite is a
compiler: it replaces `import.meta.env.VITE_API_BASE` with the literal text of
the value while bundling, and then throws the environment away. By the time
anyone visits the site there is no setting left to change.

Practical consequence: **changing this value on the dashboard does nothing until
you trigger a new build.** Not a restart. Not a redeploy of the same build. A
new build. On Render: *Manual Deploy → Clear build cache & deploy*.

Optional and safe to leave empty: `VITE_SENTRY_DSN`, `VITE_ANALYTICS_KEY`,
`VITE_ANALYTICS_HOST`.

> Anything starting with `VITE_` ends up inside a file any visitor can read.
> Never put a secret there.

### C2. If you use Cloudflare Pages instead

- Build command: `npm ci && npm run build --workspace apps/frontend`
- Build output directory: `apps/frontend/dist`
- Environment variable: `VITE_API_BASE` as above
- Deep links (`/host/events/<id>`) already work: `wrangler.jsonc` sets `not_found_handling: single-page-application` (and `netlify.toml` does the same on Netlify).

### C3. If you use Vercel instead

- **Root Directory: `apps/frontend`** (important — this is an npm workspaces
  monorepo; `apps/frontend/vercel.json` assumes it)
- Environment variable: `VITE_API_BASE` as above
- Everything else is in `vercel.json`.

### C4. Whichever you pick, go back and fix CORS

The frontend's real address must be in the backend's `CORS_ALLOWED_ORIGINS`
**and** its hostname in `ALLOWED_HOSTS`. If you deployed to Vercel, that's
`https://naada.vercel.app`, not the Render address. Update the backend's
environment variables and redeploy it.

---

## Did it work? A checklist

Work down the list. Each step assumes the one above passed.

**1. The API is alive and can reach the database.**

```bash
curl -i https://naada-api.onrender.com/api/v1/health/
```

Want: `HTTP/2 200` and a body like

```json
{"status":"ok","version":"1.0.0","service":"naada-api",
 "components":{"database":"ok","cache":"ok"}}
```

A `503` still tells you something useful — it names the broken component. If
`"database"` shows an error, your `DATABASE_URL` is wrong (go back to A2). If
`"cache"` does, `REDIS_URL` is wrong. `"cache":"skipped"` is normal and fine —
it means no Redis is configured.

**2. Migrations actually ran.**

```bash
curl -s https://naada-api.onrender.com/api/v1/events/ | head -c 400
```

Want: JSON with `"count"` and `"results"`. A 500 here almost always means the
tables don't exist yet.

**3. The API docs render** — this proves static files work.

Open <https://naada-api.onrender.com/api/v1/docs/> in a browser. You should see
the Swagger UI, styled. If the page loads but looks like unstyled text, static
files are broken; see the troubleshooting section.

**4. The admin loads.**

Open <https://naada-api.onrender.com/admin/> and log in with the superuser from
A5.

**5. The website loads and talks to the API.**

Open <https://naada-web.onrender.com>. Then press **F12 → Network**, reload, and
confirm you see requests going to `naada-api.onrender.com` returning `200`. Red
entries saying "CORS" mean Step B4 needs fixing.

**6. Deep links work.**

Open a detail page, copy the URL from the address bar, paste it into a fresh tab
and press Enter. It must load the page, not a 404.

**7. The background worker is alive.**

In Render → `naada-worker` → Logs, look for `celery@... ready.` and a list of
registered tasks including `apps.bookings.tasks.nightly_reconciliation`.
In `naada-beat` → Logs, look for `beat: Starting...`.

**8. A booking can be paid for end to end.**

Sign up on the live site (your OTP code appears in the `naada-api` logs if you
haven't configured SMTP), book something, and pay. The mock gateway will accept
it and issue a ticket. No real money moves.

---

## When it goes wrong

### "DisallowedHost" / `Invalid HTTP_HOST header`

The backend's `ALLOWED_HOSTS` doesn't contain the hostname the request arrived
on. The error message in the Render logs names the exact host it saw — copy that
hostname into `ALLOWED_HOSTS` (no `https://`, no trailing slash) and redeploy.

### The website loads but every request fails with a CORS error

The browser console says something like *"Access to fetch … has been blocked by
CORS policy"*. This is the backend refusing the frontend, and it is almost always
one of three things:

1. **A trailing slash.** `https://naada-web.onrender.com/` ≠
   `https://naada-web.onrender.com`. Remove it.
2. **A missing scheme.** `CORS_ALLOWED_ORIGINS` needs `https://`.
   (`ALLOWED_HOSTS` needs it *removed*. Yes, they're opposite. Yes, that's why
   everyone gets it wrong.)
3. **A space after the comma.** `a.com, b.com` — the space becomes part of the
   second origin.

Whatever you change, **redeploy the backend**. Environment variables are read at
startup.

### The API returns 500 on pages that used to work; logs mention a manifest

Full error: `ValueError: Missing staticfiles manifest entry for ...`

Production serves static files through WhiteNoise's
`CompressedManifestStaticFilesStorage`. It looks every file up in a manifest
built by `collectstatic`, and **returns a 500 for anything not in it** rather
than a 404. So if `collectstatic` didn't run, or ran before a file was added,
pages die.

`python manage.py collectstatic --noinput` is not optional. In this repo it runs
inside `apps/backend/Dockerfile` at image build time. If you have edited the
Dockerfile or moved to a host that builds differently, make sure that command
still runs on every build.

To fix right now: redeploy with **Clear build cache & deploy**.

### The admin or docs page loads as unstyled text

Same cause as above — `collectstatic` didn't run. Same fix.

### The site works, but chat never connects

Symptoms: the browser console shows a WebSocket connection to `/ws/chat/...`
closing immediately, often with a `403`.

Three causes, in order of likelihood:

1. **The frontend's hostname is missing from `ALLOWED_HOSTS`.** Channels checks
   the WebSocket's `Origin` header against `ALLOWED_HOSTS`, separately from CORS.
   Add the frontend hostname and redeploy the backend.
2. **The web process isn't ASGI.** If someone changed the start command to
   `gunicorn naada.wsgi:application`, WebSockets cannot work at all. It must be
   `daphne -b 0.0.0.0 -p $PORT --proxy-headers naada.asgi:application`.
3. **The proxy isn't forwarding the upgrade.** Render and Railway both handle
   WebSocket upgrades automatically. If you put Cloudflare in front with proxying
   on, make sure WebSockets are enabled in the Cloudflare network settings.

### Supabase: "SSL connection required" / "server does not support SSL"

- *SSL required* — you passed a URL that disabled TLS. Don't add
  `?sslmode=disable`; the app applies `sslmode=require` to every Postgres URL
  automatically.
- *Server does not support SSL* — you are pointing at a **local** Postgres (for
  example the `docker compose` one) with the production default. Set
  `DB_SSLMODE=prefer` for that case only. Never against Supabase.

### Supabase: connection times out, or "could not translate host name"

You used the **direct** connection string (`db.<ref>.supabase.co`). It is IPv6
only on the free plan and Render cannot reach it. Switch to the **session
pooler** string (`aws-1-<region>.pooler.supabase.com:5432`). See A2.

### Supabase: "prepared statement already exists" or similar oddities

You used the **transaction** pooler (port `6543`) somewhere it doesn't belong.
Either move to the session pooler on port 5432, or set `DB_POOLED=True` so the
app disables persistent connections and server-side cursors. Port 6543 is
detected automatically, so this only bites if you've overridden something.

### Supabase: authentication failed

Your database password contains a character with special meaning in a URL
(`@`, `:`, `/`, `#`, `?`). Reset it from Supabase → Settings → Database to
something with only letters and digits, then update `DATABASE_URL` everywhere.

### The frontend still calls localhost, or the old API address

`VITE_API_BASE` was changed but the site was not **rebuilt**. The old value is
compiled into the JavaScript. Trigger a fresh build (Render: *Clear build cache
& deploy*), then hard-refresh the browser (Cmd+Shift+R).

To confirm what's actually in the bundle:

```bash
curl -s https://naada-web.onrender.com/assets/index-*.js | grep -o 'https://[a-z0-9.-]*/api/v1' | head
```

### Everything is fine but nothing happens in the background

Escrow doesn't release; the nightly job never runs. Check that `naada-worker`
and `naada-beat` are both **running** in Render, not suspended, and that both
have the same `REDIS_URL` as `naada-api`. A worker connected to a different
Redis than the web process looks perfectly healthy and does nothing.

### First request of the day takes 50 seconds

You're on a Render free instance, which spins down after 15 minutes idle.
Upgrade `naada-api` to Starter.

---

## When Razorpay is approved

Until then, do nothing: `PAYMENT_GATEWAY` defaults to `mock` and the entire
booking flow works.

The switch is deliberately strict. Setting `PAYMENT_GATEWAY=razorpay` **without**
valid credentials makes the app raise an error rather than quietly fall back to
the mock — because silently falling back would mean issuing real tickets for
money that never moved.

**1. Add these to the backend environment group** (so web, worker and beat all
get them), then redeploy:

| Variable | Value |
|---|---|
| `PAYMENT_GATEWAY` | `razorpay` |
| `RAZORPAY_KEY_ID` | `rzp_live_...` (or `rzp_test_...` while testing) |
| `RAZORPAY_KEY_SECRET` | From the Razorpay dashboard |
| `RAZORPAY_WEBHOOK_SECRET` | You choose this when creating the webhook, below |

**2. Register the webhook.** In the Razorpay dashboard → Settings → Webhooks →
Add New Webhook:

- **URL:** `https://naada-api.onrender.com/api/v1/payments/webhook/razorpay/`
  (with the trailing slash — Django will redirect without it and Razorpay treats
  the redirect as a failure)
- **Secret:** any long random string. Put the same value in
  `RAZORPAY_WEBHOOK_SECRET`.
- **Active events:** `payment.captured`, `payment.failed`, `refund.processed`

**3. Also required before Razorpay activates an Indian merchant account:** the
`/terms`, `/privacy`, `/refunds` and `/contact` pages must resolve on your live
domain with real content. Those pages exist in
`apps/frontend/src/screens/legal.tsx`, but several fields still literally say
`TO BE COMPLETED` — registered company name, office address, support phone,
GSTIN and grievance officer. Merchant review will reject a policy that says
`TO BE COMPLETED`. Fill those in before applying.

**4. Verify** with a ₹1 live transaction, then check Razorpay's webhook delivery
log shows a `200`.

---

## Appendix — running the whole thing on your own laptop

`docker-compose.yml` at the repository root runs the exact production setup
locally: real Postgres, real Redis, the same `naada.settings.production` module,
the same ASGI server, the worker and the scheduler. If it works here it will
work on Render.

```bash
cd /Users/apple/Desktop/NADDA/dev/Naada
docker compose up --build
```

Then:

- App: <http://localhost:8080>
- API health: <http://localhost:8000/api/v1/health/>
- API docs: <http://localhost:8000/api/v1/docs/>

Useful commands:

```bash
docker compose logs -f backend          # follow the API logs (OTP codes appear here)
docker compose exec backend python manage.py seed_data
docker compose exec backend python manage.py createsuperuser
docker compose ps                       # health status of every service
docker compose down                     # stop, keep the data
docker compose down -v                  # stop and WIPE the database
```

Two things differ from real production, both because `localhost` has no HTTPS:
`SECURE_SSL_REDIRECT=False` (otherwise every request redirects to
`https://localhost` and nothing loads) and `DB_SSLMODE=prefer` (the local
Postgres container has no TLS certificate). Both are set in the compose file and
neither applies to a real deploy.

Changed `VITE_API_BASE`? You must rebuild, not restart:
`docker compose build frontend && docker compose up -d frontend`.

---

## Appendix — every environment variable

### Backend

**Required in production:**

| Variable | Example | Notes |
|---|---|---|
| `DJANGO_ENV` | `naada.settings.production` | Selects the settings module. Defaults to `naada.settings.local`. |
| `SECRET_KEY` | 64 random characters | Refuses to boot on the dev default. Same value on web, worker and beat. |
| `DATABASE_URL` | `postgresql://postgres.ref:pw@aws-1-ap-south-1.pooler.supabase.com:5432/postgres` | Refuses to boot on SQLite. |
| `ALLOWED_HOSTS` | `naada-api.onrender.com,naada-web.onrender.com,127.0.0.1` | Hostnames only. Include the **frontend** host too, for WebSockets. |
| `CORS_ALLOWED_ORIGINS` | `https://naada-web.onrender.com` | With scheme, no trailing slash. |

**Strongly recommended:**

| Variable | Example | Notes |
|---|---|---|
| `REDIS_URL` | `redis://...` | Without it: no cross-process chat, and Celery has no broker. |

**Optional — all safe to leave unset:**

| Variable | Default | Notes |
|---|---|---|
| `PAYMENT_GATEWAY` | `mock` | `razorpay` requires real credentials or it errors. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | placeholders | |
| `SENTRY_DSN` | *(empty)* | Empty = cleanly disabled. |
| `SENTRY_ENVIRONMENT` / `SENTRY_TRACES_SAMPLE_RATE` | `production` / `0.1` | |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USE_TLS` | `smtp.gmail.com` / `587` / `True` | |
| `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` | *(empty)* | Both empty ⇒ email prints to the logs. |
| `DEFAULT_FROM_EMAIL` | `Showzy <noreply@naada.live>` | |
| `CSRF_TRUSTED_ORIGINS` | https entries of CORS | |
| `SECURE_SSL_REDIRECT` | `True` | Set `False` only for plain-HTTP local runs. |
| `DB_SSLMODE` | `require` | `prefer` only for a local Postgres. |
| `DB_CONN_MAX_AGE` | `60` | Seconds, non-pooled connections only. |
| `DB_POOLED` | auto (port 6543) | Force pooled behaviour on another port. |
| `AWS_STORAGE_BUCKET_NAME` + `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_S3_REGION_NAME` / `AWS_S3_ENDPOINT_URL` / `AWS_S3_CUSTOM_DOMAIN` | *(empty)* | Object storage activates only when the bucket name is set. |
| `MEDIA_URL` / `MEDIA_ROOT` | `/media/` / `media/` | |
| `OTP_LENGTH` / `OTP_EXPIRY_MINUTES` / `OTP_MAX_ATTEMPTS` | `6` / `10` / `5` | |
| `OTP_DEBUG_RESPONSE` | forced `False` in production | Cannot be enabled in production. Good. |

### Frontend (build time only)

| Variable | Example | Notes |
|---|---|---|
| `VITE_API_BASE` | `https://naada-api.onrender.com/api/v1` | Include `/api/v1`, no trailing slash. **Rebuild to change.** |
| `VITE_SENTRY_DSN` | *(empty)* | |
| `VITE_ANALYTICS_KEY` / `VITE_ANALYTICS_HOST` | *(empty)* | |

---

## Files that make this work

| File | Purpose |
|---|---|
| `docker-compose.yml` | Full local prod-parity stack |
| `.dockerignore` | Keeps 440 MB out of the frontend build context |
| `.github/workflows/ci.yml` | Tests and builds on every push |
| `apps/backend/Dockerfile` | Backend image; runs `collectstatic` at build time |
| `apps/backend/render.yaml` | **Copy to the repo root** — the Render blueprint |
| `apps/backend/railway.json` | Railway config (web service only) |
| `apps/backend/Procfile` | Any Procfile-based host |
| `apps/backend/.env.example` | Every backend variable, documented |
| `apps/frontend/Dockerfile` | Vite build + nginx; context is the repo root |
| `apps/frontend/nginx.conf` | SPA history fallback, caching, gzip |
| `apps/frontend/vercel.json` | Vercel config |
| `wrangler.jsonc` | Cloudflare: publishes `apps/frontend/dist`, with the SPA fallback |
| `netlify.toml` | Netlify SPA fallback |
| `apps/frontend/.env.example` | Frontend variables |

# Go-live checklist (website, API, database, email)

Plain words. Do the steps in order. Each step says **what to set**, **where to set it**, and **where to find the value**.

## The picture

```
  Visitor's browser
        |
        v
  showzy.in  ----------------->  Cloudflare  (serves the website files)
        |                          needs: VITE_API_BASE   <- tells the site where the API is
        |
        v   (the website calls the API)
  Render: API  ------------------------------>  Supabase  (the database)
        |       needs: DATABASE_URL, SECRET_KEY, ALLOWED_HOSTS,
        |              CORS_ALLOWED_ORIGINS, FRONTEND_URL
        |
        +--------->  Redis (Render adds it for you)
        |
        +--------->  Titan mailbox (sends sign-in codes and ticket emails)
                       needs: EMAIL_HOST, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD
```

Every arrow is a setting. If one setting is missing or wrong, only that arrow breaks. That is why a site can load but sign-in fails.

## Do I need GitHub secrets?

**No.** GitHub only runs the tests (`.github/workflows/ci.yml`) and needs no passwords. Cloudflare and Render each watch your GitHub repo themselves and rebuild when `main` changes. The settings live **inside Cloudflare and Render**, not in GitHub.

## Where to start

1. **Database** (Supabase), get the connection string
2. **API** (Render), set its settings, check it is alive
3. **Website** (Cloudflare), tell it the API address, rebuild
4. **Domain**, point `showzy.in` at the website
5. **Email**, add the mailbox login
6. **Bot check** (Turnstile), optional but recommended

Do not skip ahead. The website needs the API address from step 2, and the API needs the website address from step 4.

---

## 1. Database (Supabase)

| What | Value | Where to find it |
|---|---|---|
| `DATABASE_URL` | The **Session pooler** connection string (port **5432**) | Supabase → your project → **Connect** → *Session pooler*. Replace `[YOUR-PASSWORD]` with the database password you chose when creating the project. Details: `DEPLOY.md` step A2 |

You set this in Render (step 2), not in Supabase. The tables are created automatically when Render deploys (`migrate` runs before each deploy).

## 2. API (Render)

Set these in **Render → Environment Groups → `naada-backend`** (all three services share it), then save and let it redeploy.

| Setting | What to put | Where to find it |
|---|---|---|
| `SECRET_KEY` | A long random string | Run `python3 -c "import secrets; print(secrets.token_urlsafe(64))"` and paste the result. Never reuse it anywhere else |
| `DATABASE_URL` | From step 1 | Supabase, see above |
| `ALLOWED_HOSTS` | `<api-address>,showzy.in,www.showzy.in,127.0.0.1,localhost` | `<api-address>` is at the top of the `naada-api` page in Render, like `naada-api-xxxx.onrender.com`. No `https://`, no spaces |
| `CORS_ALLOWED_ORIGINS` | `https://showzy.in,https://www.showzy.in` | The website addresses. With `https://`, no `/` at the end. While testing, also add the Cloudflare test address: Cloudflare → Workers & Pages → `showzy-main` → shows `https://showzy-main.<something>.workers.dev` |
| `FRONTEND_URL` | `https://showzy.in` | Your website address. **If this is missing, every link in every email points at `localhost`** |
| `OTP_PEPPER` | Another long random string | `python3 -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `TRUSTED_PROXY_COUNT` | `1` (already the default) | Leave it. Only change if you put Cloudflare in front of the API |

Already set for you by the blueprint: `DJANGO_ENV`, `REDIS_URL`, `PAYMENT_GATEWAY=mock`.

**Check it is alive** (replace the address):

```bash
curl https://<api-address>/api/v1/health/
```

You want a short answer that lists `database` and `cache` as `ok`. This call really talks to both, so `database: ok` means **API → database works**. A failure answers 503 and names the part that is down. Then open Render → `naada-api` → **Logs**; the usual cause is a wrong `DATABASE_URL`.

**Ask the app what you forgot.** In Render → `naada-api` → **Shell**:

```bash
python manage.py check --deploy
```

It prints warnings in plain English. `naada.W005` means `FRONTEND_URL` is unset, `W006` means `CORS_ALLOWED_ORIGINS` is unset, `W002` means email is not configured, `W004` means the bot check is off.

## 3. Website (Cloudflare)

Set in **Cloudflare → Workers & Pages → `showzy-main` → Settings → Build → Variables and secrets**:

| Setting | What to put | Where to find it |
|---|---|---|
| `VITE_API_BASE` | `https://<api-address>/api/v1` | The same Render address as above, **plus `/api/v1`** |
| `VITE_TURNSTILE_SITE_KEY` | The public site key | Step 6. Leave out for now if you skip the bot check |

**Important:** these are baked into the site when it is *built*. After changing them you must rebuild: Deployments → the latest one → **Retry**, or push any commit. Changing them without rebuilding does nothing.

## 4. Domain

1. In Cloudflare DNS, delete the **two A records** for `showzy.in` that point to `15.197.148.33` and `3.33.130.190` (GoDaddy's parking page). **Do not touch** the MX, TXT, DKIM, `email` and `_domainconnect` records; those are your mail.
2. `showzy-main` → Settings → **Domains & Routes** → Add → Custom domain → `showzy.in`, then `www.showzy.in`.
3. Wait a few minutes, then open `https://showzy.in`.

(The 525 error you saw was the parking page. Step 1 and 2 fix it.)

**Check the website can talk to the API (CORS):**

```bash
curl -i -X OPTIONS https://<api-address>/api/v1/auth/request-otp/ \
  -H "Origin: https://showzy.in" -H "Access-Control-Request-Method: POST"
```

Look for `access-control-allow-origin: https://showzy.in` in the answer. If it is missing, `CORS_ALLOWED_ORIGINS` in step 2 is wrong or has a typo. That is the cause of "the site loads but nothing works".

## 5. Email (Titan mailbox)

Set in the same Render group:

| Setting | What to put | Where to find it |
|---|---|---|
| `EMAIL_HOST` | Usually `smtp.titan.email` | GoDaddy → Email & Office → your email → **Server settings** (look for *SMTP* or *outgoing*). GoDaddy's own Workspace Email uses `smtpout.secureserver.net` instead |
| `EMAIL_PORT` | `587` | Same page. If it says port 465 (SSL), set `465` and also `EMAIL_USE_SSL=True` and `EMAIL_USE_TLS=False` |
| `EMAIL_HOST_USER` | `amd@showzy.in` | The real mailbox login, **not** an alias |
| `EMAIL_HOST_PASSWORD` | That mailbox's password | The one you use to sign in to it. Type it only into Render, never into chat or git |

The app sends from the aliases `auth@`, `tickets@` and `alerts@showzy.in`. **One thing is not proven yet:** whether the mail server allows sending "from" an alias. Test it: sign in on the live site with an address you own and check the code arrives. If it fails with a sender error, set `EMAIL_FROM_AUTH`, `EMAIL_FROM_TICKETS` and `EMAIL_FROM_ALERTS` all to `Showzy <amd@showzy.in>`.

Until the two `EMAIL_HOST_*` login values are set, sign-in codes are printed in the Render logs instead of emailed (nobody can sign in).

## 6. Bot check (Turnstile), recommended

1. Cloudflare → **Turnstile** → Add widget → hostname `showzy.in` (and `www.showzy.in`) → *Managed*.
2. Copy the **Site key** into Cloudflare as `VITE_TURNSTILE_SITE_KEY` (step 3) and rebuild.
3. Copy the **Secret key** into Render as `TURNSTILE_SECRET_KEY` (step 2).

Set **both** or neither. Setting only the secret blocks everyone from signing in, because the website would send no token.

---

## Final test, in order

1. `https://<api-address>/api/v1/health/` says ok (**API → database**).
2. The CORS command above shows your website address (**website → API**).
3. Open `https://showzy.in`, browse events (data comes from the database).
4. Sign in with your own email. The code arrives (**API → mailbox**) and signs you in.
5. In Render → `naada-api` → Shell, `python manage.py check --deploy` shows no `naada.W` warnings you care about.

## If something is off

| What you see | Likely cause | Fix |
|---|---|---|
| Site loads, lists are empty or every request fails | `VITE_API_BASE` missing or wrong, or not rebuilt | Step 3, then **Retry** the build |
| Browser console says "blocked by CORS policy" | `CORS_ALLOWED_ORIGINS` wrong | Step 2 and the CORS test |
| API answers `400 Bad Request` / "Invalid HTTP_HOST" | Address missing from `ALLOWED_HOSTS` | Step 2 |
| `health` fails or 500 | `DATABASE_URL` wrong | Step 1; use the *Session pooler* string |
| "We couldn't send the code" | Mailbox login or host wrong, or SMTP blocked | Step 5; read Render logs. Render's free plan is believed to block SMTP ports (check Render's docs); your paid plan should not |
| Sign-in code never arrives, nothing in logs | Mail login not set (codes print to logs) | Step 5 |
| Email links open `localhost` | `FRONTEND_URL` not set | Step 2 |
| Sign-in says verification failed | Only one of the two Turnstile keys set, or wrong hostname | Step 6 |
| `525` on showzy.in | Domain still points at the parking page | Step 4 |

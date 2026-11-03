# Deploying to Railway

Deploys two services plus a database from this monorepo: **API** (`apps/api`), **Web admin**
(`apps/web`) and **PostgreSQL**. Redis, worker and scheduler are not used yet (nothing in the code
needs them), so don't create them. The mobile app is built with Expo, not Railway.

> I could not run Docker or Railway from the development sandbox, so these steps and the two
> Dockerfiles are **untested on Railway**. The API and web code themselves were tested locally.
> Railway's UI changes; where a label differs, check https://docs.railway.com.

## 0. Before you start
- A Railway account with the GitHub app connected to this repository.
- Decide your environments: create the project once, then add `staging` and `production`
  environments (project → Environments → New). Repeat steps 2–6 in each; they do not share data.
- Generate secrets locally (one per environment, never reuse):
  `openssl rand -base64 48` → `JWT_SECRET`.

## 1. Create the project
1. Railway → **New Project** → **Deploy PostgreSQL**. Rename the service `rw-postgres`.

## 2. API service
1. In the project: **New** → **GitHub Repo** → this repo. Rename the service `rw-mobile-api`.
2. **Settings → Source → Root Directory**: `apps/api`. (It picks up `apps/api/Dockerfile` and
   `railway.json`; health check path is `/api/v1/health`.)
3. **Variables** (use Railway reference syntax for the database):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{rw-postgres.DATABASE_URL}}` |
   | `JWT_SECRET` | the generated secret (≥ 32 chars; the API refuses to start otherwise) |
   | `PORT` | `3000` |
   | `HOST` | `::` only if the web service cannot reach the API privately (see step 4) |
   | `LOGIN_RATE_LIMIT` | leave unset (default 10/min per IP) |
   | `ACCOUNTING_ALLOW_SELF_APPROVAL` | leave unset/`false` in production (see step 6) |
   | `REQUIRE_ADMIN_2FA` | `true` once both admins have enabled 2FA (step 6) |

4. Deploy. On each start the container runs `prisma migrate deploy` and then the server, so
   migrations apply automatically. A bad migration fails the deploy and the previous version keeps
   serving.
5. Do **not** generate a public domain for the API unless the mobile app needs it (it does, see step 7).

## 3. Create the first Super Admin (in the browser, no terminal)
On the `rw-mobile-api` service open **Variables** and add all three:

| Variable | Value |
|---|---|
| `BOOTSTRAP_ADMIN_USERNAME` | the name you want to sign in with (3–32 letters, digits, `.` `_` `-`) |
| `BOOTSTRAP_ADMIN_EMAIL` | your email |
| `BOOTSTRAP_ADMIN_PASSWORD` | a temporary password, at least 12 characters |

Railway redeploys. On startup, **only if no Super Admin exists yet**, the API creates this account (logged as
`Created first Super Admin ...`). It is marked "must change password": your first sign-in sends you to the
Profile page to set a real password and enable two-factor. **Afterwards delete these three variables.**
Leaving them is harmless (they are ignored once any admin exists) but the temporary password stays in
Railway's settings. A wrong or partial set is ignored with a warning in the logs.

## 4. Web admin service
1. **New** → **GitHub Repo** → same repo. Rename `rw-web-admin`. **Root Directory**: `apps/web`.
2. **Variables**:

   | Variable | Value |
   |---|---|
   | `API_URL` | `http://${{rw-mobile-api.RAILWAY_PRIVATE_DOMAIN}}:3000/api/v1` |

   This is server-to-server over Railway's private network; the browser only talks to the web
   service. If requests fail with connection errors, set `HOST=::` on the API (private networking
   can be IPv6-only) and redeploy it.
3. **Settings → Networking → Generate Domain**. This is your admin URL.
4. Open it and sign in with the username and temporary password from step 3.

## 5. Quick verification
- `https://<web domain>/login` loads; sign in works; Dashboard shows counts.
- API logs show `Nest application successfully started` and no migration errors.
- Create an Agency in **Account Management**; suspend and reactivate it; check **Audit Logs**.

## 6. Second administrator and approvals
Accounting entries and reconciliations must be approved by someone other than their creator.
1. Sign in to the web admin as the first Super Admin → **Administrators** → add the second admin with a
   temporary password (share it through a secure channel). They must change it at first sign-in.
2. Both admins enable two-factor on **My profile**. Then set `REQUIRE_ADMIN_2FA=true` on the API
   service (recommended) and redeploy.
3. Keep `ACCOUNTING_ALLOW_SELF_APPROVAL` unset/`false` in production. Staging may use `true` for solo testing.
Losing an authenticator device has no self-service recovery yet; a database fix is required, so keep at
least two administrators.

## 7. Mobile app
The app needs a reachable API URL. Either generate a public domain for `rw-mobile-api`
(Settings → Networking) or put the API behind your own domain, then build with
`EXPO_PUBLIC_API_URL=https://<api domain>/api/v1` and distribute via EAS. Set `CORS_ORIGINS`
only if a browser app calls the API directly (the admin does not).

## 8. Operations
- **Backups:** enable Postgres backups/volume snapshots in `rw-postgres` (plan-dependent) and also
  schedule a `pg_dump` to storage you control. Do a test restore into staging before relying on it.
- **Rollback:** Deployments tab → pick the last good deployment → Redeploy. Migrations are not
  rolled back automatically; write a forward migration to undo schema changes.
- **Logs/monitoring:** Railway logs only for now; Sentry and structured logging are not wired.
- **Secrets:** rotating `JWT_SECRET` signs everyone out (access tokens only; refresh tokens are
  random and stored hashed).
- **Not provided:** worker/scheduler/Redis services, CCTV gateway, push notifications.

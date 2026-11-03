# Account hierarchy & admin platform — Phases 1–4 (backend)

Scope: five-level accounts (SUPER_ADMIN > AGENCY > AGENT > STAFF > USER), auth, scoped access,
inherited suspension, global maintenance mode, immutable audit log. Nothing here touches wallets,
rounds, commissions or payments.

## Architecture
- `apps/api` — NestJS 11 + Prisma 6 + PostgreSQL. Prefix `/api/v1`.
- Hierarchy: `users.parent_id` + denormalised `agency_id/agent_id/staff_id` + closure table
  `account_hierarchy` (ancestor, descendant, depth) for cheap subtree/ancestor queries.
- Every request re-checks: valid unrevoked session, and **no suspended node among the account's
  ancestors (including itself)**. Suspension and revocation are immediate; there is no stale cache.
- Out-of-scope account ids return 404 (no existence leak).
- Guard order: Throttler → JwtAuth → Maintenance → Permissions (static role→permission matrix,
  seeded into `roles/permissions/role_permissions`).
- Audit log: append-only (DB trigger blocks UPDATE/DELETE/TRUNCATE), SHA-256 hash chain, written in
  the same transaction as the change it records.

## Role–permission matrix
| Permission | SUPER_ADMIN | AGENCY | AGENT | STAFF | USER |
|---|---|---|---|---|---|
| accounts:read (own subtree) | ✓ | ✓ | ✓ | ✓ | – |
| accounts:create | any level | AGENT | STAFF | USER | – |
| accounts:suspend / reactivate | ✓ | – | – | – | – |
| audit:read | ✓ | – | – | – | – |
| system:manage (maintenance) | ✓ | – | – | – | – |
| system:read | ✓ | ✓ | ✓ | ✓ | ✓ |

## Endpoints
| Method | Path | Notes |
|---|---|---|
| POST | /auth/register | USER self-registration via `staffUsername` referral |
| POST | /auth/login, /auth/refresh, /auth/logout; GET /auth/me | refresh tokens rotate |
| POST | /auth/2fa/setup, /auth/2fa/enable | TOTP; Super Admin login flags `twoFactorSetupRequired` |
| GET/POST | /accounts | list (search, role, status, parentId, pagination) / create |
| GET | /accounts/:id, /accounts/:id/history | |
| GET | /accounts/:id/suspension-preview | affected-account counts for the confirmation screen |
| POST | /accounts/:id/suspend, /reactivate | reason required; reactivate blocked while an ancestor is suspended |
| GET/PUT | /system/status | ACTIVE / MAINTENANCE / SUSPENDED (PUT: Super Admin) |
| GET | /audit | Super Admin, filterable |
| GET | /health | DB ping |

`/agencies`, `/agents`, `/staff`, `/users` are served as `GET /accounts?role=…` for now.

## Run
```
cd apps/api && cp .env.example .env && npm ci
npx prisma migrate deploy
SEED_ADMIN_PASSWORD='<12+ chars>' npm run seed
npm run build && npm start
API=http://localhost:3000/api/v1 ADMIN_PASSWORD=... ./test/smoke.sh
```

## Tests
- Unit (jest, 12): hierarchy rules, permission matrix, scoping, suspend/reactivate, audit hash.
- E2E smoke (17 checks, real PostgreSQL 16): chain creation, cross-hierarchy isolation, permission
  denial, instant session death on suspension, ancestor-blocked reactivation, maintenance mode,
  audit written. All passing. Audit-table DELETE confirmed rejected by the trigger.

## Not done yet
- Web admin (Next.js) and mobile (Expo) apps.
- Redis/BullMQ, Sentry, push notifications, structured logs, DB backups.
- `admin_activity_logs` table (audit_logs covers admin actions for now).
- Permissions are code-defined; DB tables are seeded copies, not runtime-editable.
- Railway: Dockerfile + railway.json only; services/environments not created.

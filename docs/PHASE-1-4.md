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

## Web admin (`apps/web`, Next.js 15 + Tailwind)
- Pages: login (with 2FA prompt), dashboard, accounts (search/role/status filters, pagination,
  create), account detail (suspend/reactivate with affected-count confirmation, status history),
  system status (maintenance), audit log. Agency/Agent/Staff/User sidebar entries are filtered views.
- Super Admin only: non-admin logins are rejected and their session revoked immediately.
- Tokens live in httpOnly, SameSite=Strict cookies; the browser talks to a same-origin proxy
  (`/api/proxy/*`) that attaches the token and refreshes it. State-changing requests require a
  matching `Origin`. The API remains the sole authority for authorization.
- Verified with a headless-browser run (14 checks) against the real API + PostgreSQL.
- Run: `cd apps/web && API_URL=http://localhost:3000/api/v1 npm run dev`.
- Not built yet: sidebar sections for later phases (wallet, accounting, commission, CCTV, etc.).

## Mobile shell (`apps/mobile`, Expo SDK 58 + expo-router)
- Screens: sign in (2FA prompt, maintenance/suspension messages), register (via staff referral
  username), Home (greeting, account card, application-status banner, pull-to-refresh), Profile
  (details, biometric unlock toggle, sign out), Locked (biometric gate).
- Tokens are stored in the platform keychain/keystore (`expo-secure-store`). A single shared refresh
  handles concurrent 401s; a failed refresh signs the user out. Sign-out revokes the server session.
- Biometric unlock is opt-in and shown only when hardware is present and enrolled.
- Config: `EXPO_PUBLIC_API_URL` (see `.env.example`). Run: `cd apps/mobile && npx expo start`.
- Verified: TypeScript clean and an Android production bundle builds. **Not yet run on a device or
  emulator**, so the UI, biometric prompts and keychain storage are untested in practice.
- Not built: Wallet, Demonstration, CCTV, History tabs, push notifications (later phases).
- API change: `GET /auth/me` now returns the full profile. Login rate limit is configurable with
  `LOGIN_RATE_LIMIT` (default 10/min per IP).

## Accounting module (`/api/v1/accounting`, Super Admin only)
Real company books, fully separate from any in-app balance. Double-entry with `Decimal(18,2)`.
- Tables: chart_of_accounts, accounting_periods, journal_entries, journal_entry_lines,
  financial_approvals (migration `20261103010000_accounting`).
- Workflow: DRAFT → PENDING_APPROVAL → APPROVED → POSTED → REVERSED. Rejection returns to DRAFT.
  Every transition is state-checked atomically and written to the approval trail and audit log.
- Segregation of duties: the creator cannot approve their own entry. **With a single Super Admin
  nobody can approve**; either add a second Super Admin or set `ACCOUNTING_ALLOW_SELF_APPROVAL=true`
  (not recommended for production).
- Immutability is enforced in PostgreSQL triggers, not just the API: lines can't change once an entry
  leaves DRAFT, posted entries can only become REVERSED, entries can't be deleted, a post requires
  ≥2 lines with debit = credit, the approval trail is append-only. Corrections are reversal entries.
- Periods can't overlap, can't close with unposted entries, and block posting once closed.
- Reports: trial balance, profit & loss, balance sheet (posted entries; reversals net to zero), CSV
  export with spreadsheet-formula neutralisation.
- Web: journal list/create, entry detail with workflow buttons, chart & periods, reports.
- Not built: agency statements, adjustments, Excel/PDF export.

## Admin additions
- `GET /accounts/export.csv` (same scoping/filters as the list) and an Export CSV button.
- Account detail shows the parent link and direct subordinates for drill-down.
- Tests: 25 unit tests; `test/accounting-smoke.sh` (30 checks incl. 5 direct-SQL immutability
  checks and, with `EXPECT_SOD=1`, the segregation-of-duties refusal); a 13-check browser run.

## Cash flow statement & bank reconciliation
- **Cash accounts:** an ASSET account can be flagged `isCash` (`PATCH /accounting/accounts/:id/cash-settings`).
  The flag is locked by a DB trigger once the account has journal lines, so flag cash accounts *before*
  posting to them. Other accounts get a cash-flow section (operating / investing / financing); unset
  defaults to financing for equity and operating for everything else.
- **Cash flow (direct method)** `GET /accounting/reports/cash-flow?from&to` (+ `/export.csv`): every
  non-cash line of an entry that moves cash explains part of the movement (credit = inflow, debit =
  outflow). Entries that don't touch cash (non-cash revaluations, transfers between cash accounts)
  are excluded. The result reports opening cash + net change = closing cash and flags if it doesn't.
- **Reconciliation:** start a draft for a cash account with the statement date and ending balance, mark
  posted ledger lines as cleared, and complete only when the cleared balance equals the statement
  (difference exactly 0). One open draft per account; statement dates must advance; a line can be
  cleared once, ever. The preparer cannot complete their own reconciliation (same
  `ACCOUNTING_ALLOW_SELF_APPROVAL` switch). Completed reconciliations are frozen by DB triggers.
  `GET /accounting/reconciliations/status` shows book balance and unreconciled line count per account.
- Web: Financial Reports gains Cash flow; new Reconciliation pages; Chart & Periods has cash toggles.
- Tests: 30 unit tests; `test/cashflow-recon-smoke.sh` (29 checks incl. 4 direct-SQL immutability
  checks); a 10-check browser run. Browser testing found and fixed a crash when switching report types.
- Not built: importing bank statement files, auto-matching, discrepancy notifications (the
  notifications module doesn't exist yet), multi-currency.

## Role portals (Agency / Agent / Staff)
- The web panel now serves every management level. The sidebar is built from the signed-in role:
  Agency (agents, staff, users), Agent (staff, users), Staff (users). Accounting, system settings
  and audit logs are Super Admin only: hidden in the UI, redirected if opened by URL, and refused
  by the API. End users get a clear "use the mobile app" message on the web login.
- Creating accounts: each role can create only the level directly below (Agency→Agent,
  Agent→Staff, Staff→User) and it is attached to their own account. Lists, search, CSV export and
  detail pages show only their own downline; accounts outside it return "not found".
- Suspend/reactivate remain Super Admin only (buttons hidden for others).
- `POST /auth/change-password` (all roles; web Profile page and mobile Profile): verifies the
  current password, signs out all other devices, audited. Rate-limited.
- Mobile: managers get a Team tab (search, paginate, add the next level down).
- Tests: browser run `apps/web/test-portals.e2e.js` (22 checks) drives Agency→Agent→Staff→User
  creation through the real UI, scoping, redirects, password change and end-user rejection.
  Mobile: TypeScript + Android bundle only; still not run on a device.
- Not built for these roles: demo-credit allocation and commission reports (those belong to the
  wallet/commission features that were not built), CCTV, notifications.

## Internal game: in-game credits, rounds and winners
**Scope guardrails (deliberate):** credits are an internal allowance with **no cash value**. They are
granted only by a Super Admin; there is no purchase, deposit, withdrawal or transfer endpoint
(tests assert these paths do not exist); credits are **never lost** (picks are held while a round is
open and every hold is released at publish or cancel); there are no commissions or payouts; and the
game is not connected to the accounting module. If credits are ever sold, redeemed or exchanged for
anything of value this becomes gambling: do not do that with this code.

- **Wallet** (`/wallet`): `me`, `me/ledger`, `grant` (Super Admin, idempotent via key), `balances`.
  Append-only ledger (GRANT/HOLD/RELEASE) with balance snapshots; DB constraints forbid negative
  balances; a test verifies every wallet equals the sum of its ledger.
- **Rounds** (`/game`): DRAFT → OPEN → LOCKED → RESULT_PENDING → COMPLETED (or CANCELLED).
  Admin: create (configurable minimum per number, default 10,000), open, lock, set result 1–27
  (preview shows who would win; players cannot see it), publish, cancel. Players: pick any set of
  numbers 1–27 with credits each, edit freely while OPEN (atomic replace), see results, history
  and a leaderboard of rounds won. Published results are immutable (DB trigger); the round state
  machine and "no picks after lock" are enforced in PostgreSQL as well as the API. Maintenance
  mode blocks players. Super Admin cannot play.
- **Web:** Super Admin gets Game Rounds (create, lifecycle, picks-by-number chart, preview, publish)
  and Credits (grant + balances). Agency/Agent/Staff get Play (number grid, stakes, live balance,
  results, leaderboard, history). **Mobile:** Play tab for everyone.
- **Tests:** 6 new unit tests; `test/game-smoke.sh` (64 checks, incl. a concurrent-submission race,
  cancel/refund, role and maintenance checks, 8 direct-SQL guard checks, ledger reconciliation);
  `apps/web/test-game.e2e.js` (20 browser checks: admin and two players through grant, open,
  pick, lock, preview, publish). Browser testing found and fixed a form-reset crash.
- **Not built:** correcting a published result (would need a separate audited action), grants by
  Agency/Agent/Staff (Super Admin only), commissions, notifications, round schedules/timers.
  The mobile app is verified by type-check and bundle only, never run on a device.

## Notifications (in-app)
- `GET /notifications` (paging, `?unread=true`), `GET /notifications/unread-count`,
  `POST /notifications/:id/read`, `POST /notifications/read-all`. Every query is scoped to the
  caller; another account's notice returns 404.
- Created inside the same database transaction as the change they describe:
  - round **opened** → every active non-admin account ("New round open");
  - result **published** → each participant: "You won! 🏆" or "Result published, credits returned";
  - round **cancelled** → participants only ("credits returned").
  Draft creation and entering a result (preview) notify nobody; suspended accounts are skipped;
  Super Admin is never notified of their own actions.
- Web: bell count on the sidebar link (refreshes on navigation, every 30 s and on read), a
  Notifications page (unread filter, mark all read, click-through to the round / Play page).
  Mobile: "Alerts" tab with an unread badge, list, mark-all-read, tap to open Play.
- Tests: `test/notifications-smoke.sh` (20 checks) and `apps/web/test-notifications.e2e.js`
  (8 browser checks). Mobile verified by type-check and bundle only.
- **Not built: push notifications** (needs Expo push tokens and a real device to verify; the other
  notification types in the original spec, e.g. account suspended, CCTV, accounting approval,
  reconciliation discrepancy, are not wired). Notices are not auto-purged.

## Second (and further) Super Admins
- **Web:** Administrators page (list, add, suspend, reactivate). **API:** `GET/POST /admins`,
  `POST /admins/:id/suspend|reactivate` (Super Admin only).
- Creating, suspending or reactivating an administrator requires the acting admin's **own password**
  (a wrong one returns 403 `REAUTH_FAILED`, so the session is not mistaken for expired). Sensitive
  admin routes are rate-limited (`ADMIN_RATE_LIMIT`).
- New admins get a **temporary password** (min 12 chars) and `mustChangePassword`. The server then
  rejects every route except `/auth/*` (403 `PASSWORD_CHANGE_REQUIRED`) until they change it; the web
  panel sends them to Profile.
- **2FA:** the Profile page now has authenticator-app setup. Set `REQUIRE_ADMIN_2FA=true` (recommended
  in production) and administrators without 2FA are limited to `/auth/*` (403 `TWO_FACTOR_REQUIRED`)
  until they enable it; after that every sign-in needs the 6-digit code.
- Safety rails: nobody can suspend themselves; the **last active administrator can never be
  suspended** (checked under an advisory lock so two admins cannot suspend each other concurrently);
  suspension revokes sessions immediately; everything is audited and recorded in status history.
- With two admins and `ACCOUNTING_ALLOW_SELF_APPROVAL` unset, segregation of duties works end to end
  (verified: creator refused, second admin approves and posts).
- Tests: 4 new unit tests; `test/admins-smoke.sh` (29 checks, runs against two servers, one with
  `REQUIRE_ADMIN_2FA=true` and self-approval off); `apps/web/test-admins.e2e.js` (14 browser checks).
  Browser testing found and fixed a bug where a wrong confirmation password logged the admin out.
- Not built: admin password reset by another admin (they can suspend and re-create), email
  invitations, 2FA recovery codes (losing the authenticator device currently needs a database fix),
  QR code rendering (the key is shown for manual entry).

## First admin without a terminal
`BOOTSTRAP_ADMIN_USERNAME/EMAIL/PASSWORD` (see `docs/RAILWAY.md` step 3): on startup, and only when no
Super Admin exists, the API creates one with a temporary password that must be changed at first sign-in.
Verified on an empty database (login → blocked until password change → change → full access) and
that a restart with different values creates nothing. 4 unit tests. The seed script remains available.

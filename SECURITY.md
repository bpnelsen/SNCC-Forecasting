# Security

This document describes the security model of the SNCC Forecasting app and the
operational steps required to keep it safe. **Code changes alone are not
sufficient — the dashboard steps below must be completed.**

## Architecture

- **App:** Next.js 14 (App Router) on Vercel (or any Node host).
- **Data:** Supabase (PostgreSQL + Storage).
- **Auth:** Supabase Auth (email magic link, invite-only).

## Access-control layers (defense in depth)

1. **Middleware auth gate** (`src/middleware.ts`) — every page and `/api/*`
   route requires a valid Supabase session. Pages redirect to `/login`;
   API requests without a session get `401`.
2. **Row Level Security** (`supabase/migrations/015_enable_rls.sql`) — RLS is
   enabled + forced on all tables. Only authenticated users (or the
   service-role API) can read/write. The anon key reaches nothing.
3. **Rate limiting** (`src/middleware.ts`) — per-IP limits on `/api/*`
   (120/min) and `/api/import` (10/min).
4. **Sanitized errors** (`src/lib/api-errors.ts`) — full detail logged
   server-side; clients get a generic message (no table/column/SQL leakage).
5. **Security headers** (`next.config.js`) — HSTS, CSP, `nosniff`,
   `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy.
6. **Upload hardening** (`src/app/api/import/route.ts`) — `.xlsx` only, 15 MB cap.

## Required dashboard setup (do these in order)

### Supabase
1. **Authentication → Providers → Email:** enable. Set **Site URL** and add the
   redirect URL `https://<your-app>/auth/callback`.
2. **Authentication → Users → Invite:** add each authorized user. Self-signup is
   disabled in code (`shouldCreateUser: false`), so users must be invited.
3. **SQL Editor:** run `supabase/migrations/015_enable_rls.sql`. Verify:
   - `select tablename, rowsecurity from pg_tables where schemaname='public';` → all `true`
   - `select tablename, policyname, roles, cmd from pg_policies where schemaname='public';` → 2 per table
   - Anon REST check: `GET https://<project>.supabase.co/rest/v1/loans` with only the
     anon key should return empty/denied.
4. **Storage:** confirm the `current-reports` bucket is **Private**.
5. **Settings → Database:** confirm **Point-in-Time Recovery / daily backups** are on.
6. **Settings → API:** rotate the `anon` and `service_role` keys (they were
   previously unprotected), then update them in the host env vars.

> ⚠️ Run RLS (step 3) only **after** email auth works and users are invited —
> once RLS is on, only signed-in users (or the service-role API) can read data.

### Host (Vercel / other)
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`. Never commit these.
- Optional stopgap before auth is live: enable Deployment Protection (password/SSO).

## Ongoing process

- **Keys:** rotate quarterly; store only in host env + local `.env.local`
  (gitignored). Never in `README.md`, source, or examples beyond placeholders.
- **Accounts:** enable 2FA on Supabase + host; limit dashboard access; least privilege.
- **Backups:** keep PITR on; periodically test a restore.
- **Dependencies:** run `npm audit` and keep `next`, `@supabase/*`, and `xlsx`
  current (`xlsx` has had CVEs).
- **New tables:** every new table must get RLS + a policy before merge (mirror
  migration 015).
- **New API routes:** use `apiError()` in catch blocks; never return raw errors.

## Known limitations / future hardening

- **Rate limiting is per-instance (in-memory).** For strict global limits on a
  multi-instance host, swap in `@upstash/ratelimit` + Upstash Redis.
- **RLS policies are "any authenticated user."** Matches the current
  single-org model. For per-user/per-org isolation, add an ownership column and
  change policies from `using (true)` to `using (auth.uid() = owner_id)`.
- **Input validation** is basic. Consider adding `zod` schemas to write routes.
- **CSP** allows `'unsafe-inline'`/`'unsafe-eval'` (needed by Next/Tailwind).
  Tighten to a nonce-based CSP if stricter guarantees are required.

## Reporting

Report suspected vulnerabilities privately to the repository owner.

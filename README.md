# SNCC Portfolio Forecasting

Construction lending portfolio intelligence dashboard for Security National Financial Corporation.

**Features:**
- Dashboard with portfolio balance charts (SFR, MFR, A&D, Raw Land, Finished Lots, Land Bucket)
- Forward forecast with income / yield projections, sliceable by parent company
- Per-loan projection table with inline type / release-rule editing
- Land Bucket, New Originations, A&D, HHH/JV and Approved Loans planning tabs
- Current Report import with drag-and-drop (`.xlsx`, `.xlsm`, `.xls`)
- Full version history — restore any prior import as active
- `/ask` assistant over the forecast data (optional, needs an OpenRouter key)

---

## Tech Stack

| Layer    | Tool                           |
|----------|--------------------------------|
| Frontend | Next.js 15 (App Router), React 19 |
| Database | Supabase (PostgreSQL)          |
| Auth     | Supabase Auth (email/password) |
| Hosting  | Vercel                         |
| Charts   | Recharts                       |
| Tests    | Vitest                         |

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/bpnelsen/sncc-forecasting.git
cd sncc-forecasting
npm install
```

### 2. Create a Supabase project

Create a project at [supabase.com](https://supabase.com), pick a nearby region, and save the database password.

### 3. Run the database migrations — **all of them, in order**

In Supabase Dashboard → **SQL Editor**, run every file in `supabase/migrations/`
in filename order (`001_…` through `020_…`).

Running only `001` is not enough — the app will not start. `002` creates
`forecast_settings`, which `/api/calculate` requires, and later migrations add
the tables behind New Originations, HHH/JV, A&D, Parent Companies and Approved
Loans. `020` enables Row Level Security and is what keeps your data private.

All migrations are idempotent, so re-running the whole folder is safe. CI
applies them twice against a clean Postgres on every push to prove that stays
true, and asserts RLS is enabled on every table.

| Migration | Adds |
|-----------|------|
| `001` | `current_report_versions`, `loans`, legacy `assumptions` (+ seed) |
| `002` | `loan_programs`, `builders`, `land_bucket_projects`, `forecast_settings` (+ seed) |
| `003` | Land Bucket per-project overrides |
| `004`, `010` | Extra builders (Fieldstone, Other) |
| `005`–`007`, `009` | `new_origination_schedule` + recurring series / rate override |
| `008` | `hhh_jv_projects` |
| `011` | `a_and_d_loans` |
| `012`, `013` | Parent companies, patterns, borrower mapping, builder → parent |
| `014` | Renames builders to match their parent company |
| `015` | Finished Lots release rule columns |
| `016` | `approved_loans` |
| `017`–`019` | Reclassify existing loans by program |
| `020` | **Enables RLS on every table** |

### 4. Lock down account creation

The app ships a `/signup` page. Decide how accounts get made:

**Recommended — admin-created accounts only.** Leave `SIGNUP_ALLOWED_DOMAINS`
empty, and in Supabase → **Authentication → Sign In / Providers** turn **off**
"Allow new users to sign up". Then create each user under
**Authentication → Users → Add user** (tick "Auto Confirm User").

**Or — self-service, restricted to your domains.** Set
`SIGNUP_ALLOWED_DOMAINS=securitynational.com` and **still** turn off "Allow new
users to sign up" in Supabase. That setting matters: the anon key is public, so
without it anyone can POST to Supabase's own `/auth/v1/signup` and create an
account regardless of the allowlist in this app.

### 5. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in values from Supabase → Project Settings → API. See the comments in that
file for what each one does.

> ⚠️ Never commit `.env.local` — it's in `.gitignore`.
> `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. Keep it server-side only.

### 6. Run locally

```bash
npm run dev       # http://localhost:3000 — redirects to /login
npm run verify    # typecheck + lint + tests
```

### 7. Deploy to Vercel

1. **New Project** → import the GitHub repo
2. Framework: **Next.js** (auto-detected)
3. Add the environment variables for **all** environments (Production, Preview, Development)
4. Deploy

Vercel deploys the **production** URL from the branch configured as its
Production Branch (Project → Settings → Git). Pushing any other branch produces
a **Preview** deployment at its own URL; production does not change until that
branch is merged into the production branch.

---

## Security model

All data access goes through `/api/*` route handlers using the **service role**
key, which bypasses RLS. Three layers keep that from being world-readable:

1. **`src/middleware.ts`** requires a signed-in Supabase user for every page
   **and every `/api/*` route**. Pages redirect to `/login`; API requests get a
   401. Missing env vars fail closed (503). Only `/login`, `/signup` and
   `/api/auth/signup` are public.
2. **`requireUser()`** (`src/lib/auth.ts`) re-checks the session inside all 48
   route handlers, so a mistake in the middleware `matcher` can't silently
   reopen the API.
3. **Migration `020`** enables RLS with **no policies** and revokes table grants
   from `anon` and `authenticated`. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is visible
   in the browser bundle, so the Supabase REST endpoint is publicly reachable —
   RLS is what makes that key useless. `service_role` has `BYPASSRLS`, so the
   app is unaffected.

Account creation is gated by `/api/auth/signup`, which enforces the
`SIGNUP_ALLOWED_DOMAINS` allowlist server-side and creates users via the admin
API. See step 4 — the Supabase dashboard setting is the other half of this.

If you later want the browser to query Supabase directly, you must add explicit
RLS policies first.

### Known outstanding items

**`xlsx` is frozen at `0.18.5` on npm**, which has an unpatched
prototype-pollution and ReDoS advisory (`npm audit` says "No fix available").
SheetJS publishes fixes from their own CDN:

```bash
npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

That host was unreachable from the environment this was set up in, so it's left
as a manual step. Uploads are gated behind authentication and capped at 4 MB,
which is the main practical mitigation meanwhile.

**Remaining `npm audit` "high" findings** are `next`, `postcss` and `sharp`.
All three are *transitive* — `npm audit` attributes them to `next` because Next
bundles `postcss` and pulls `sharp` in for image optimization; none are in
Next's own code, and the only listed fix is `next@16` (a major upgrade that also
removes `next lint`). This app renders no `next/image`, so sharp's image path is
never exercised. The critical middleware authorization-bypass advisory
(CVE-2025-29927) was fixed back in `14.2.25` and does not apply to 15.x.

---

## Usage

### Import a Current Report

1. Sign in, then go to **Import**
2. Drop your Current Report export (`.xlsx`, `.xlsm` or `.xls`, up to 4 MB)
3. Add a version label like "March 2026" and click **Import Report**

The import:
- Picks the first sheet with a recognisable header row (headers may sit well
  below row 1 — the canonical export puts them on row 31)
- Classifies each loan from its **Loan Program** (see below)
- Computes `projected_balance = MAX(disbursed, current_loan_amount × draw %)`,
  where draw % comes from **Assumptions → Import: projected balance**
- Writes all loans to an inactive version first, verifies the row count, and
  only then promotes it. A failed or timed-out import is rolled back and
  **leaves the previous version active**
- Reports how many loans were unclassifiable or missing a maturity date

### Data-quality warnings

Two conditions silently distort the forecast, so the import screen and the
dashboard both call them out:

- **Unclassified loans** (`loan_type = 'UNKNOWN'`) contribute to **no segment
  at all** — `hhh_existing` is hardcoded to 0, so their balances go *missing*
  from portfolio totals rather than landing in the wrong bucket. Fix by setting
  the type per loan on the **Loans** tab, or by updating `classifyLoan()` in
  `src/lib/parser.ts`.
- **Loans with no maturity date** are held flat for the whole horizon instead of
  paying off, so balances trend high. Usually means the "Current Loan Due Date"
  column wasn't detected.

### Assumptions

**Assumptions** holds the inputs the forecast actually consumes:

- **Import: projected balance** — the active draw %, applied at import time
- **Loan Programs** — default rate, term and draw curve per program; these drive
  every new-origination cohort
- **Parent Companies** — patterns and per-borrower overrides for the parent filter

Land Bucket projects are edited on the **Land Bucket** tab; planned starts on
**New Originations**.

> The legacy `assumptions` table still holds NHCF and profit-sharing columns the
> engine does not read. Their editors were removed rather than left implying they
> affect the forecast. `runForecast()` hardcodes `profit_sharing: 0` and excludes
> it from `total_income` — wire it in before re-adding that editor.

---

## Loan classification

`classifyLoan()` in `src/lib/parser.ts` reads **only** the `Loan Program` field.
Borrower name and development name are deliberately ignored: parent-company
attribution owns borrower mapping, and the HHH/JV segment is sourced from the
manual `/hhh-jv` tab.

Rules are checked in order — the first match wins:

| Order | Type | Detection |
|-------|------|-----------|
| 1 | `MFR` | "Multifamily", "Multi-family", " MF" |
| 2 | `RAW_LAND` | "Land Acquisition" / "Land Aquisition" (known misspelling) |
| 3 | `RAW_LAND` | "Raw Land", "Raw" |
| 4 | `A&D` | "Memorial Investments" |
| 5 | `A&D` | "Acquisition" / "Aquisition", "A&D", "Development Loan" |
| 6 | `FINISHED_LOTS` | "Finished Lot", "Lot Loan" |
| 7 | `OTC` | "OTC" (One-Time Close) — rolls into the SFR segment, keeps its own tag |
| 8 | `SFR` | "Single Family", "SFR", "Residential Construction", "Construction" |
| — | `UNKNOWN` | anything else |

`UNKNOWN` loans are excluded from portfolio totals — see the warning above.

---

## Calculation engine

`src/lib/calculator.ts` · `runForecast()`. The horizon always starts at the
**current month** (a stored `forecast_settings.start_date` in the past is
ignored) and runs for `horizon_months`.

| Concern | Implemented by |
|---------|----------------|
| Existing loan balances | `projectExistingLoanBalance()` |
| Finished Lots release | `finishedLotsReleased()` — pays down by lots × release rule |
| Land Bucket | `runLandBucket()` — absorption or manual release schedule |
| New origination cohorts | `lotOriginationBalance()` — recurring series over a lot pool |
| Planned A&D loans | `projectAAndDLoan()` — origination → draw ramp → lot releases |
| HHH/JV projects | `hhhJvBalanceForMonth()` |
| Income | per-loan rate where present, else program default / settings fallback |
| Annualized yield | (monthly income / total balance) × 12 |

Behaviours worth knowing:

- **A recurring new-origination entry that started before the horizon is kept**,
  with its lot pool fast-forwarded by however many loans it would already have
  originated. Entries starting after the horizon, or whose pool or `end_month`
  is already exhausted, are skipped.
- **An A&D loan originated before the horizon is caught up** — its pre-window
  draws and lot releases are replayed so it doesn't restart its ramp at month 0.
- **`horizon_months` below 1 throws** an explicit error rather than an opaque 500.
- **The Loans tab uses a different method** (linear interpolation from disbursed
  toward max(…)) than the dashboard's flat-until-maturity, so per-loan figures
  there do not tie to portfolio totals. **These two need reconciling** — pick one
  method and use it in both places.

Regression tests for all of the above are in `src/lib/calculator.test.ts`.

---

## Next 15 notes

The app targets Next 15 / React 19. Things that differ from the Next 14 code:

- **`cookies()` is async.** `createSupabaseServerClient()` (`src/lib/supabase-server.ts`)
  is therefore async too, and every caller must `await` it.
- **Dynamic route `params` is a Promise.** All ten `[id]` route handlers take
  `{ params }: { params: Promise<{ id: string }> }` and resolve it with
  `const { id } = await params` immediately after the auth guard.
  `src/app/api/builders/[id]/route.test.ts` pins that contract — it fails if the
  Promise is passed through unresolved.
- **GET route handlers are no longer cached by default.** The
  `export const dynamic = 'force-dynamic'` lines are now redundant but kept
  deliberately, so a future default change can't silently start serving
  build-time snapshots of the loan data.
- **`serverComponentsExternalPackages` moved out of `experimental`** and is now
  `serverExternalPackages` in `next.config.js`.

---

## Project structure

```
src/
├── middleware.ts               # session gate for all pages + /api routes
├── app/
│   ├── login/, signup/         # auth screens
│   ├── dashboard/              # portfolio dashboard + parent filter
│   ├── loans/                  # per-loan table, inline type editing
│   ├── forecast/, originations/
│   ├── land-bucket/, a-and-d/, hhh-jv/, approved/
│   ├── assumptions/, import/, versions/
│   ├── ask/                    # assistant tab
│   └── api/                    # 28 route handlers, all requireUser()-guarded
├── components/
└── lib/
    ├── auth.ts                 # requireUser() / getUser() / signup allowlist
    ├── fetch-all.ts            # paginates past Supabase's 1,000-row cap
    ├── supabase.ts             # service-role + browser clients
    ├── supabase-server.ts      # cookie-backed server client
    ├── parser.ts               # Excel → Loan[]  (+ parser.test.ts)
    ├── calculator.ts           # forecast engine  (+ calculator.test.ts)
    └── types.ts, utils.ts, gemini-tools.ts
supabase/migrations/            # 001–020, apply all in order
.github/workflows/ci.yml        # typecheck, lint, test, build, migrations
```

---

## Development

```bash
npm run dev          # dev server
npm run typecheck    # tsc --noEmit
npm run lint         # eslint src --ext .ts,.tsx
npm run test         # vitest run
npm run verify       # all three
```

Requires **Node 18.18+** (a Next 15 floor); CI and Vercel both run Node 20.

`lint` calls the ESLint CLI directly rather than `next lint`, which Next 15
deprecates and Next 16 removes. The config stays in `.eslintrc.json` (eslintrc
format, ESLint 8) — moving to ESLint 9 flat config is a separate step.

CI runs typecheck, lint, tests and a build, plus applies every migration twice
against a clean Postgres 16 and asserts RLS is on for every table.

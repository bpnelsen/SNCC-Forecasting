# SNCC Portfolio Forecasting

Construction lending portfolio intelligence dashboard for Security National Financial Corporation.

**Features:**
- Dashboard with portfolio balance charts (SFR, MFR, A&D, Raw Land, Finished Lots, Land Bucket)
- 17-month forward forecast with income/yield projections
- Editable assumptions panel (draw %, rates, loan counts, profit sharing)
- Current Report import with drag-and-drop (`.xlsx`)
- Full version history — restore any prior import as active

---

## Tech Stack

| Layer    | Tool                          |
|----------|-------------------------------|
| Frontend | Next.js 14 (App Router)       |
| Database | Supabase (PostgreSQL)         |
| Storage  | Supabase Storage              |
| Hosting  | Vercel                        |
| Charts   | Recharts                      |

---

## Setup Instructions

### 1. Create a GitHub Repository

```bash
# On GitHub.com, create a new repo named "sncc-forecasting"
# Then locally:

git clone https://github.com/YOUR_USERNAME/sncc-forecasting.git
cd sncc-forecasting

# Copy all project files into this directory, then:
npm install
```

### 2. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Name it `sncc-forecasting`
3. Choose a region close to you (e.g. US West)
4. Save the database password

### 3. Run the Database Migration

1. In Supabase Dashboard → **SQL Editor**
2. Paste and run the contents of `supabase/migrations/001_initial_schema.sql`
3. This creates all tables and seeds default assumptions

### 4. Create the Storage Bucket

In Supabase Dashboard → **Storage** → **New Bucket**:
- Name: `current-reports`
- Public: **No** (private)

### 5. Configure Environment Variables

Copy `.env.local.example` to `.env.local`:

```bash
cp .env.local.example .env.local
```

Fill in values from your Supabase project (Settings → API):

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
```

> ⚠️ Never commit `.env.local` — it's in `.gitignore`

### 6. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll land on the Dashboard.

### 7. Deploy to Vercel

```bash
# Push to GitHub first
git add .
git commit -m "Initial SNCC forecasting app"
git push origin main
```

Then in [vercel.com](https://vercel.com):
1. **New Project** → Import your GitHub repo
2. Framework: **Next.js** (auto-detected)
3. Add Environment Variables (same 3 from `.env.local`)
4. Deploy

---

## First-Time Usage

### Import Your Current Report

1. Navigate to **Import** in the sidebar
2. Drag and drop your `Forecasting_3_1_26.xlsx` file (or any Current Report export)
3. Add a version label like "March 2026"
4. Click **Import Report**

The app will:
- Parse all loans from the `Current Report` sheet
- Classify each loan as SFR / MFR / A&D / Raw Land / Finished Lots / HHH
- Store the raw data versioned in Supabase
- Set this as the active version

### Adjust Assumptions

Navigate to **Assumptions** to update:
- Draw percentages (SF 90%, MF 92%)
- Interest rates (projected loans, land bucket)
- Profit sharing amounts per builder per unit type
- New loan origination counts per builder per month (NHCF)
- Payoff counts per month
- Land bucket development details (release prices, costs, dates)

Click **Save Changes** — the dashboard will reflect updated calculations on next load.

### Version History

Every time you import a new Current Report:
- The old version is automatically archived
- Navigate to **Versions** to see all imports with timestamps
- Click **Restore** on any version to roll back

---

## File Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout with nav
│   ├── page.tsx                # Redirect → /dashboard
│   ├── globals.css             # Design tokens + base styles
│   ├── dashboard/page.tsx      # Main portfolio dashboard
│   ├── forecast/page.tsx       # New originations forecast
│   ├── assumptions/page.tsx    # Editable assumptions panel
│   ├── import/page.tsx         # xlsx import with dropzone
│   ├── versions/page.tsx       # Version history
│   └── api/
│       ├── calculate/route.ts  # Core forecast calculation
│       ├── import/route.ts     # xlsx parser + DB insert
│       ├── versions/route.ts   # List + restore versions
│       └── assumptions/route.ts # CRUD for assumptions
├── components/
│   ├── layout/Navigation.tsx   # Sidebar navigation
│   ├── ui/StatCard.tsx         # KPI stat card
│   └── charts/PortfolioCharts.tsx # All Recharts components
└── lib/
    ├── types.ts                # All TypeScript types
    ├── supabase.ts             # Supabase client
    ├── parser.ts               # Excel → Loan[] parser
    ├── calculator.ts           # Replicates Excel formulas
    └── utils.ts                # Format helpers
supabase/
└── migrations/
    └── 001_initial_schema.sql  # Full DB schema + seed data
```

---

## Loan Classification Logic

The parser classifies each loan by reading the `Loan Program` field:

| Type            | Detection                                           |
|-----------------|-----------------------------------------------------|
| `SFR`           | "Single Family", "SFR", "Residential Construction" |
| `MFR`           | "Multifamily", "Multi-family", "MF"                |
| `RAW_LAND`      | "Raw Land", "Raw"                                  |
| `A&D`           | "Acquisition", "A&D", "Development Loan"           |
| `FINISHED_LOTS` | "Finished Lot", "Lot Loan"                         |
| `HHH`           | Borrower contains "Holmes", dev contains "Oquirrh" |

If a loan doesn't match, it's classified as `UNKNOWN` and excluded from balance totals (you'll see the count in the DB — update the classifier in `src/lib/parser.ts` as needed).

---

## Calculation Engine

`src/lib/calculator.ts` replicates the Excel logic:

| Excel Sheet         | Replicated By                                        |
|--------------------|------------------------------------------------------|
| SFR / MFR / A&D etc. | `projectLoanBalance()` — ramp from current to projected over months remaining |
| Current Report col Q | `MAX(disbursed, loan_amount × draw%)` for projected balance |
| NHCF rows 6–200     | `calcNhcf()` — draw curve by builder type            |
| Land Bucket         | `calcLandBucket()` — cost buildout minus lot releases |
| Summary row 47–50   | Yield on active + projected + LB + profit sharing    |
| Summary row 53      | Annualized yield = (monthly income / total balance) × 12 |

---

## Adding a New Builder to NHCF

1. In `src/app/assumptions/page.tsx`, add to the `BUILDERS` array:
   ```ts
   { key: 'builder_key', label: 'Builder Name', type: 'SF' }
   ```
2. In Supabase, update the `nhcf_loan_counts`, `nhcf_payoff_counts`, and `nhcf_loan_sizes` JSONB columns in the `assumptions` table to include the new builder key.

---

## Support

For questions about the calculation engine, loan classification, or data model, refer to the original `Forecasting_3_1_26.xlsx` workbook structure documented in the project notes.

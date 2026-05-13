-- Modular forecasting assumptions: builders, loan programs, land bucket projects,
-- and global forecast settings.
--
-- Additive only — the legacy `assumptions` table (single row with JSONB blobs) is
-- left in place so the existing calculator keeps working. Migration 003 will drop
-- the legacy columns once the new engine is wired up.

-- ─── 1. Loan programs ─────────────────────────────────────────────────────────
-- Each program has a draw curve (incremental monthly fractions of max balance),
-- a default rate, and a default term. The forecast engine applies a program's
-- curve to every loan cohort originated under that program.
create table if not exists loan_programs (
  id                   uuid primary key default uuid_generate_v4(),
  name                 text not null unique,
  product_type         text not null check (product_type in ('SF','MF','LOT','AD','RAW_LAND','OTHER')),
  -- Incremental monthly draw fractions, e.g. [0.05, 0.10, 0.15, ...]
  -- Sum should be ~1.0. Length = months to fully draw.
  draw_curve           jsonb not null default '[]',
  default_rate         numeric not null default 0.0525,
  -- Total months from origination to payoff (draw period + hold period).
  default_term_months  int    not null default 18,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ─── 2. Builders ──────────────────────────────────────────────────────────────
-- Master list of builders. Each carries a default lot absorption rate
-- (lots/month) and a default loan program used when a project doesn't override.
create table if not exists builders (
  id                       uuid primary key default uuid_generate_v4(),
  name                     text not null unique,
  default_absorption_rate  numeric not null default 2,
  default_loan_program_id  uuid references loan_programs(id) on delete set null,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ─── 3. Land bucket projects ──────────────────────────────────────────────────
-- One row per development. Replaces the assumptions.land_bucket JSONB array.
-- The engine generates a month-by-month lot sale schedule, runs the outstanding
-- balance down by (lots_sold × lot_price), and accrues interest at interest_rate
-- (paid current — not capitalized).
create table if not exists land_bucket_projects (
  id                       uuid primary key default uuid_generate_v4(),
  name                     text not null unique,
  builder_id               uuid references builders(id) on delete set null,
  total_lots               int not null,
  lot_price                numeric not null,
  -- Lots/month. NULL = fall back to builder's default_absorption_rate.
  absorption_rate          numeric,
  -- Current land balance outstanding; rolled forward each month by the engine.
  balance_outstanding      numeric not null default 0,
  -- Fixed rate, paid current (not capitalized into the balance).
  interest_rate            numeric not null default 0.0525,
  dev_start_date           date,
  dev_end_date             date,
  -- First month lots are available for builder purchase.
  lot_sales_start_date     date,
  -- When a lot is purchased, the engine originates a vertical loan in this
  -- program. NULL = no automatic vertical origination from this project.
  vertical_loan_program_id uuid references loan_programs(id) on delete set null,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_lb_projects_builder on land_bucket_projects(builder_id);

-- ─── 4. Forecast settings ─────────────────────────────────────────────────────
-- Single active row. Drives forecast start date, horizon, and global fallback
-- rates used when a program/project doesn't specify its own.
create table if not exists forecast_settings (
  id                     uuid primary key default uuid_generate_v4(),
  start_date             date not null default date_trunc('month', current_date)::date,
  horizon_months         int  not null default 17,
  default_rate_vertical  numeric not null default 0.0525,
  default_rate_land      numeric not null default 0.0525,
  is_active              boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create unique index if not exists idx_one_active_forecast_settings
  on forecast_settings (is_active) where is_active = true;

-- ─── 5. Seed data ─────────────────────────────────────────────────────────────
-- Active forecast settings starting first of current month.
insert into forecast_settings (is_active)
select true
where not exists (select 1 from forecast_settings where is_active = true);

-- Loan programs with representative draw curves. Curves are incremental
-- monthly fractions of max balance; sum ≈ 1.0; length = draw period.
insert into loan_programs (name, product_type, draw_curve, default_rate, default_term_months) values
  ('SFR Construction', 'SF',
   '[0.05,0.08,0.10,0.12,0.12,0.12,0.12,0.10,0.08,0.06,0.04,0.01]',
   0.0525, 12),
  ('MFR Construction', 'MF',
   '[0.04,0.06,0.07,0.08,0.08,0.08,0.08,0.07,0.07,0.06,0.06,0.05,0.05,0.04,0.04,0.03,0.02,0.02]',
   0.0525, 24),
  ('Lot Loan', 'LOT',
   '[1.00]',
   0.0525, 9),
  ('A&D / Development', 'AD',
   '[0.10,0.12,0.14,0.14,0.12,0.10,0.08,0.07,0.06,0.04,0.02,0.01]',
   0.0525, 18),
  ('Raw Land', 'RAW_LAND',
   '[1.00]',
   0.0525, 24)
on conflict (name) do nothing;

-- Builders that appear in the legacy NHCF seed. Default loan program assigned
-- via subquery so we don't hardcode UUIDs.
insert into builders (name, default_absorption_rate, default_loan_program_id) values
  ('Arive',    3, (select id from loan_programs where name = 'SFR Construction')),
  ('Holmes',   3, (select id from loan_programs where name = 'SFR Construction')),
  ('McArthur', 1, (select id from loan_programs where name = 'SFR Construction'))
on conflict (name) do nothing;

-- Land bucket projects mirroring the legacy JSONB seed but with proper
-- absorption rates and outstanding balances. Balances approximated from the
-- legacy (land_costs + dev_costs + interest) totals.
insert into land_bucket_projects (
  name, builder_id, total_lots, lot_price, absorption_rate,
  balance_outstanding, interest_rate,
  dev_start_date, dev_end_date, lot_sales_start_date,
  vertical_loan_program_id
) values
  ('Broadhollow',
   (select id from builders where name = 'Arive'),
   28, 245000, 3,
   5812492.92, 0.0525,
   '2023-12-01', '2024-09-01', '2024-10-01',
   (select id from loan_programs where name = 'SFR Construction')),
  ('Moonlight Village',
   (select id from builders where name = 'Arive'),
   211, 280000, 4,
   33748480.73, 0.0525,
   '2024-01-01', '2025-06-01', '2025-07-01',
   (select id from loan_programs where name = 'SFR Construction')),
  ('Stagecoach',
   (select id from builders where name = 'McArthur'),
   45, 260000, 1,
   10491519.31, 0.0525,
   '2024-03-01', '2025-03-01', '2025-04-01',
   (select id from loan_programs where name = 'SFR Construction'))
on conflict (name) do nothing;

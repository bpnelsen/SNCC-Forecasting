-- Combined Supabase setup script for SNCC Forecasting.
--
-- Paste the entire file into the Supabase SQL Editor and run once. Re-running is
-- safe: every statement uses IF NOT EXISTS or ON CONFLICT DO NOTHING.
--
-- Equivalent to running these migrations in order:
--   001_initial_schema.sql
--   002_modular_assumptions.sql
--   003_vertical_loan_amount.sql
--   004_scheduled_originations.sql


-- ════════════════════════════════════════════════════════════════════════════
-- supabase/migrations/001_initial_schema.sql
-- ════════════════════════════════════════════════════════════════════════════
-- Run this entire file in Supabase SQL Editor

create extension if not exists "uuid-ossp";

-- ─── Current Report versions ────────────────────────────────────────────────
create table if not exists current_report_versions (
  id            uuid primary key default uuid_generate_v4(),
  label         text not null,
  filename      text not null,
  file_path     text,
  imported_by   text not null default 'system',
  is_active     boolean not null default false,
  loan_count    int,
  as_of_date    date,
  notes         text,
  created_at    timestamptz not null default now()
);

create unique index if not exists idx_one_active_version
  on current_report_versions (is_active) where is_active = true;

-- ─── Individual loans ────────────────────────────────────────────────────────
create table if not exists loans (
  id                        uuid primary key default uuid_generate_v4(),
  version_id                uuid not null references current_report_versions(id) on delete cascade,
  borrower                  text,
  loan_number               text not null,
  loan_program              text,
  original_loan_amount      numeric,
  loan_funded_date          date,
  current_loan_due_date     date,
  current_loan_amount       numeric,
  loan_amount_disbursed     numeric,
  loan_amount_remaining     numeric,
  interest_reserve_balance  numeric,
  current_interest_rate     numeric,
  interest_accrued_mtd      numeric,
  project_name              text,
  unit_name                 text,
  development_name          text,
  subdivision_name          text,
  projected_balance         numeric,
  loan_type                 text,
  created_at                timestamptz not null default now()
);

create index if not exists idx_loans_version on loans(version_id);
create index if not exists idx_loans_type    on loans(loan_type);

-- ─── Assumptions ─────────────────────────────────────────────────────────────
create table if not exists assumptions (
  id                    uuid primary key default uuid_generate_v4(),
  draw_pct_sf           numeric not null default 0.90,
  draw_pct_mf           numeric not null default 0.92,
  draw_pct_active       numeric not null default 0.92,
  rate_projected_loans  numeric not null default 0.0525,
  rate_land_bucket      numeric not null default 0.0525,
  ps_holmes_sfr         numeric not null default 25000,
  ps_holmes_mfr         numeric not null default 15000,
  ps_arive_sfr          numeric not null default 20000,
  ps_arive_mfr          numeric not null default 12000,
  nhcf_loan_counts      jsonb not null default '{}',
  nhcf_payoff_counts    jsonb not null default '{}',
  nhcf_loan_sizes       jsonb not null default '{}',
  land_bucket           jsonb not null default '[]',
  ps_unit_counts        jsonb not null default '{}',
  is_active             boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists idx_one_active_assumptions
  on assumptions (is_active) where is_active = true;

-- ─── Seed default assumptions ─────────────────────────────────────────────────
insert into assumptions (
  is_active,
  nhcf_loan_counts,
  nhcf_payoff_counts,
  nhcf_loan_sizes,
  ps_unit_counts,
  land_bucket
) values (
  true,
  '{
    "arive_garretts":  {"0":0,"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"9":0,"10":0,"11":0},
    "arive_moonlight": {"0":0,"1":0,"2":0,"3":0,"4":4,"5":4,"6":4,"7":4,"8":4,"9":4,"10":4,"11":4},
    "holmes_sfr":      {"0":3,"1":3,"2":3,"3":3,"4":3,"5":3,"6":3,"7":3,"8":3,"9":3,"10":3,"11":3},
    "holmes_mfr":      {"0":2,"1":2,"2":2,"3":2,"4":2,"5":2,"6":2,"7":2,"8":2,"9":2,"10":2,"11":2},
    "mcarthur_sfr":    {"0":2,"1":2,"2":2,"3":2,"4":2,"5":2,"6":2,"7":2,"8":2,"9":2,"10":2,"11":2}
  }',
  '{
    "arive_garretts": {"0":3,"1":5,"2":5,"3":5,"4":2,"5":8,"6":2,"7":5,"8":10,"9":8,"10":7,"11":8},
    "holmes_sfr":     {"0":2,"1":2,"2":2,"3":2,"4":2,"5":2,"6":2,"7":2,"8":2,"9":2,"10":2,"11":2},
    "mcarthur_sfr":   {"0":1,"1":1,"2":1,"3":1,"4":1,"5":1,"6":1,"7":1,"8":1,"9":1,"10":1,"11":1}
  }',
  '{
    "arive_garretts":  {"sf":736000,"mf":350000},
    "arive_moonlight": {"sf":736000,"mf":390000},
    "holmes_sfr":      {"sf":650000,"mf":0},
    "holmes_mfr":      {"sf":0,"mf":500000},
    "mcarthur_sfr":    {"sf":580000,"mf":0}
  }',
  '{
    "holmes": {"0":3,"1":3,"2":3,"3":3,"4":3,"5":3,"6":3,"7":3,"8":3,"9":3,"10":3,"11":3},
    "arive":  {"0":2,"1":2,"2":2,"3":2,"4":2,"5":2,"6":2,"7":2,"8":2,"9":2,"10":2,"11":2}
  }',
  '[
    {
      "name":"Broadhollow","builder":"Arive","phases":1,"lots":28,
      "interest_rate":0.0525,"release_price":245000,
      "land_costs":1068790.51,"dev_costs":4468702.41,"interest":275000,
      "start_date":"2023-12-01","completion_date":"2024-09-01","lot_release_start":"2024-10-01"
    },
    {
      "name":"Moonlight Village","builder":"Arive","phases":7,"lots":211,
      "interest_rate":0.0525,"release_price":280000,
      "land_costs":25248480.73,"dev_costs":8000000,"interest":500000,
      "start_date":"2024-01-01","completion_date":"2025-06-01","lot_release_start":"2025-07-01"
    },
    {
      "name":"Stagecoach","builder":"McArthur","phases":1,"lots":45,
      "interest_rate":0.0525,"release_price":260000,
      "land_costs":7291519.31,"dev_costs":3000000,"interest":200000,
      "start_date":"2024-03-01","completion_date":"2025-03-01","lot_release_start":"2025-04-01"
    }
  ]'
);

-- ════════════════════════════════════════════════════════════════════════════
-- supabase/migrations/002_modular_assumptions.sql
-- ════════════════════════════════════════════════════════════════════════════
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

-- ════════════════════════════════════════════════════════════════════════════
-- supabase/migrations/003_vertical_loan_amount.sql
-- ════════════════════════════════════════════════════════════════════════════
-- Per-project vertical loan amount for lot-driven originations.
--
-- When a lot is purchased from a land bucket project, the engine originates
-- a vertical construction loan in the project's vertical_loan_program. This
-- column controls the max balance of that loan. NULL = engine falls back to
-- a default heuristic (lot_price × 3) so existing rows don't break.

alter table land_bucket_projects
  add column if not exists vertical_loan_amount numeric;

-- ════════════════════════════════════════════════════════════════════════════
-- supabase/migrations/004_scheduled_originations.sql
-- ════════════════════════════════════════════════════════════════════════════
-- Scheduled (non-lot-driven) vertical loan originations.
--
-- Replaces the legacy assumptions.nhcf_loan_counts / nhcf_loan_sizes blobs.
-- Each row schedules `count` vertical loans in a given month for a given loan
-- program, each at `max_amount_per_loan`. Builder is optional — useful for
-- organising / reporting but not consumed by the engine.
--
-- The engine ramps each cohort per program.draw_curve from forecast_month, and
-- pays it off at age = program.default_term_months.

create table if not exists scheduled_originations (
  id                   uuid primary key default uuid_generate_v4(),
  builder_id           uuid references builders(id) on delete set null,
  loan_program_id      uuid not null references loan_programs(id) on delete restrict,
  forecast_month       date not null,
  count                int     not null default 0,
  max_amount_per_loan  numeric not null,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_scheduled_originations_month
  on scheduled_originations(forecast_month);

create index if not exists idx_scheduled_originations_builder
  on scheduled_originations(builder_id);

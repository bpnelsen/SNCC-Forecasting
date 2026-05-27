-- A&D (Acquisition & Development) loans. Distinct from imported A&D loans,
-- forecasted A&D cohorts, and Land Bucket projects — these model the full
-- lifecycle of a planned A&D facility:
--   • Origination → balance jumps to (land + closing costs) = initial_balance.
--   • Draw phase  → balance ramps to ~90% of total_loan_amount over
--                   draw_period_months, either linearly or via draw_schedule.
--   • Release     → starts at release_start_date; lots release evenly over
--                   release_period_months (or per release_schedule), each
--                   lot pays the loan down by
--                     (total_loan_amount / total_lots) × lot_release_premium_pct / 100.
--
-- Forward-planned only: imported A&D loans are unaffected and the dashboard
-- A&D segment sums both sources.

create table if not exists a_and_d_loans (
  id                       uuid primary key default uuid_generate_v4(),
  name                     text not null,
  builder_id               uuid references builders(id) on delete set null,
  initial_balance          numeric not null default 0,
  total_loan_amount        numeric not null default 0,
  total_lots               int     not null default 0,
  lot_release_premium_pct  numeric not null default 110,
  interest_rate            numeric not null default 0.0525,
  origination_date         date,
  draw_period_months       int     not null default 12,
  release_start_date       date,
  release_period_months    int     not null default 12,
  -- { 'YYYY-MM': $ amount } overrides the even linear ramp for that month.
  draw_schedule            jsonb   not null default '{}'::jsonb,
  -- { 'YYYY-MM': lot count } overrides the even linear release for that month.
  release_schedule         jsonb   not null default '{}'::jsonb,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_aad_builder on a_and_d_loans (builder_id);

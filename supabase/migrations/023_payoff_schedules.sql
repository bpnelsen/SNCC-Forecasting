-- Historical payoff assumptions + the global Maturity / Historical switch.
--
-- payoff_schedules: how many months after funding a loan is assumed to pay
-- off, per parent company × loan type. A row with parent_company_id NULL is the
-- default for that loan type, used by any parent without its own row. No row
-- at all → the loan keeps its maturity-date payoff.
--
-- forecast_settings.payoff_mode: which payoff assumption the whole app
-- forecasts with. 'maturity' (default) is the original behaviour — loans run
-- to current_loan_due_date. 'historical' pays loans off at funded + N months
-- from payoff_schedules, with each program's draw curve prorated to fit.
--
-- Safe to run any time and re-runnable.

create table if not exists payoff_schedules (
  id                 uuid primary key default uuid_generate_v4(),
  parent_company_id  uuid references parent_companies(id) on delete cascade,
  loan_type          text not null
                     check (loan_type in ('SFR','OTC','MFR','A&D','RAW_LAND','FINISHED_LOTS')),
  payoff_months      int  not null check (payoff_months > 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- One row per parent × loan type. NULL parent (the default row) is folded to
-- a sentinel so it is unique too — a plain unique constraint treats NULLs as
-- distinct.
create unique index if not exists idx_payoff_schedules_parent_type
  on payoff_schedules (coalesce(parent_company_id, '00000000-0000-0000-0000-000000000000'::uuid), loan_type);

alter table payoff_schedules enable row level security;
revoke all on table public.payoff_schedules from anon, authenticated;

alter table forecast_settings
  add column if not exists payoff_mode text not null default 'maturity';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'forecast_settings_payoff_mode_check'
  ) then
    alter table forecast_settings
      add constraint forecast_settings_payoff_mode_check
      check (payoff_mode in ('maturity', 'historical'));
  end if;
end $$;

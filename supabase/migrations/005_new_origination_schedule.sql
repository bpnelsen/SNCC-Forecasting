-- One row per builder × (optional) land bucket project × month of planned
-- vertical-loan originations. The forecast engine reads this table and
-- generates a cohort at the row's month: loan_count loans, each sized
-- avg_loan_amount, drawn through the chosen loan program's curve.
--
-- land_bucket_project_id is nullable so a builder can have generic monthly
-- start counts not tied to a specific development.

create table if not exists new_origination_schedule (
  id                       uuid primary key default uuid_generate_v4(),
  builder_id               uuid not null references builders(id) on delete cascade,
  land_bucket_project_id   uuid references land_bucket_projects(id) on delete set null,
  -- YYYY-MM, matches the key format used by the forecast engine.
  month                    text not null,
  loan_count               int not null default 0,
  avg_loan_amount          numeric not null default 0,
  -- Optional program override. NULL = fall back to the builder's
  -- default_loan_program_id at calc time.
  loan_program_id          uuid references loan_programs(id) on delete set null,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_origs_builder on new_origination_schedule (builder_id);
create index if not exists idx_origs_project on new_origination_schedule (land_bucket_project_id);
create index if not exists idx_origs_month   on new_origination_schedule (month);

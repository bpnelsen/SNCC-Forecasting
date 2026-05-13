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

-- HHH / JV projects. These are NOT loans and NOT land bucket projects — they
-- are a distinct entity for joint-venture / HHH developments. The schema
-- mirrors land_bucket_projects' meaningful fields so the UI and assumptions
-- feel consistent, but it is a separate table with its own lifecycle.
--
-- Forecast role: each project's balance_outstanding contributes to the HHH/JV
-- segment of the portfolio every month from dev_start_date (inclusive month,
-- or immediately if null) until dev_end_date (exclusive month, or the whole
-- horizon if null).

create table if not exists hhh_jv_projects (
  id                       uuid primary key default uuid_generate_v4(),
  name                     text not null unique,
  builder_id               uuid references builders(id) on delete set null,
  total_lots               int not null default 0,
  lot_price                numeric not null default 0,
  absorption_rate          numeric,
  balance_outstanding      numeric not null default 0,
  interest_rate            numeric not null default 0.0525,
  dev_start_date           date,
  dev_end_date             date,
  lot_sales_start_date     date,
  vertical_loan_program_id uuid references loan_programs(id) on delete set null,
  vertical_loan_amount     numeric,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_hhh_jv_builder on hhh_jv_projects (builder_id);

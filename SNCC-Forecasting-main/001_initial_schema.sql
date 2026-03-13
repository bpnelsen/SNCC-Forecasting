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

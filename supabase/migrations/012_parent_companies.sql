-- Parent Company grouping: lets the dashboard slice imported-loan metrics by
-- parent company. Three tables:
--   parent_companies         : the parent entity (unique name).
--   parent_company_patterns  : substring patterns (case-insensitive). Any
--                              loan whose borrower contains one of these
--                              patterns is auto-assigned to that parent.
--   borrower_parent_mapping  : explicit per-borrower overrides. Wins over
--                              pattern matches at calc time.
--
-- Resolution: explicit override > first matching pattern > unassigned.

create table if not exists parent_companies (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null unique,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists parent_company_patterns (
  id                uuid primary key default uuid_generate_v4(),
  parent_company_id uuid not null references parent_companies(id) on delete cascade,
  pattern           text not null,
  created_at        timestamptz not null default now()
);
create index if not exists idx_pcp_parent on parent_company_patterns (parent_company_id);

create table if not exists borrower_parent_mapping (
  -- The borrower string from loans.borrower (exact match, case-sensitive).
  borrower          text primary key,
  parent_company_id uuid not null references parent_companies(id) on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_bpm_parent on borrower_parent_mapping (parent_company_id);

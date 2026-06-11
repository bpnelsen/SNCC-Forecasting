-- Approved Loans pipeline — loans that have committee approval and are
-- either still being worked (status='Open') or have been closed
-- (status='Closed'). The /approved page is a spreadsheet-style tracker.
--
-- "Days left" is computed in the UI from lc_approval_expiration − today,
-- not stored.
--
-- Idempotent: safe to re-run in Supabase SQL editor — does nothing if the
-- table is already at the target shape and is already seeded.

create extension if not exists "uuid-ossp";

-- 1. Table
create table if not exists approved_loans (
  id                       uuid primary key default uuid_generate_v4(),
  loan_type                text not null default 'Vertical',
  date_approved            date,
  borrower_project_name    text not null default '',
  lc_approval_expiration   date,
  status                   text not null default 'Open',
  date_completed           date,
  disposition_notes        text,
  next_steps_notes         text,
  loan_amount              numeric not null default 0,
  -- Stable display order; new rows append to the end. Keeps the spreadsheet
  -- feel even after edits / partial deletes.
  sort_order               int     not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- 2. Normalize any legacy status values (Expired / Cancelled from an earlier
-- iteration) → Closed, so the new CHECK constraint can be added safely.
update approved_loans
   set status = 'Closed'
 where status not in ('Open', 'Closed');

-- 3. Constrain status to just Open / Closed.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'approved_loans_status_check'
  ) then
    alter table approved_loans
      add constraint approved_loans_status_check
      check (status in ('Open', 'Closed'));
  end if;
end $$;

-- 4. Indexes
create index if not exists idx_approved_loans_sort   on approved_loans(sort_order);
create index if not exists idx_approved_loans_status on approved_loans(status);

-- 5. Seed the current in-process pipeline. Skipped automatically once the
-- table has any rows, so re-running this script is safe.
do $$
begin
  if (select count(*) from approved_loans) = 0 then
    insert into approved_loans (
      loan_type, date_approved, borrower_project_name,
      lc_approval_expiration, status, loan_amount, sort_order
    ) values
      ('Vertical',      '2025-12-05', 'Moonlight Village - Spec Building',                      '2026-03-05', 'Open', 0,  1),
      ('Vertical',      '2026-02-05', 'PF131 - Presold',                                        '2026-05-06', 'Open', 0,  2),
      ('A&D',           '2026-01-08', 'Fieldstone Homes- Hafen',                                '2026-04-08', 'Open', 0,  3),
      ('Finished Lots', '2026-02-27', 'Temple Town (4 lots)',                                   '2026-05-28', 'Open', 0,  4),
      ('Vertical',      '2026-03-19', 'Holmes Homes - Daybreak Q1',                             '2026-06-17', 'Open', 0,  5),
      ('Land',          '2026-04-09', 'Arive Homes- Eagle Haven Scattered Subdivision lots',    '2026-07-08', 'Open', 0,  6),
      ('Vertical',      '2026-03-26', 'McArthur AHT Bld 30',                                    '2026-06-24', 'Open', 0,  7),
      ('Vertical',      '2026-03-26', 'McArhur- AHT Bld 9',                                     '2026-06-24', 'Open', 0,  8),
      ('Vertical',      '2026-04-16', 'Oquirrh West SFR Presold OWS03307',                      '2026-07-15', 'Open', 0,  9),
      ('Vertical',      '2026-05-21', 'Element SFR- Presold',                                   '2026-08-19', 'Open', 0, 10),
      ('Vertical',      '2026-05-21', 'Element SFR- Presold',                                   '2026-08-19', 'Open', 0, 11),
      ('Vertical',      '2026-05-21', 'Fieldston Homes- Haven Spec',                            '2026-08-19', 'Open', 0, 12),
      ('Vertical',      '2026-05-21', 'Fieldston Homes- Haven Spec',                            '2026-08-19', 'Open', 0, 13),
      ('Vertical',      '2026-05-21', 'Fieldston Homes- Haven Model',                           '2026-08-19', 'Open', 0, 14),
      ('Vertical',      '2026-05-21', 'Arive Homes Moonlight Building 1',                       '2026-08-19', 'Open', 0, 15),
      ('Land',          '2026-05-21', 'Arive Homes- Gobel Subdivision',                         '2026-08-19', 'Open', 0, 16),
      ('Vertical',      '2026-05-21', 'McArthur Homes Lot 323- Presale',                        '2026-08-19', 'Open', 0, 17),
      ('Vertical',      '2026-05-21', 'McAthur Homes ierson Farms- 144 Presale',                '2026-08-19', 'Open', 0, 18),
      ('Vertical',      '2026-05-28', 'Arive- MC12',                                            '2026-08-26', 'Open', 0, 19),
      ('Vertical',      '2026-05-28', 'McArthur Towns- Build 34',                               '2026-08-26', 'Open', 0, 20),
      ('Vertical',      '2026-05-28', 'McArthur Towns - Build 18',                              '2026-08-26', 'Open', 0, 21),
      ('Vertical',      '2026-06-09', 'Narwahl- Lot 424- Eagle Point',                          '2026-09-07', 'Open', 0, 22),
      ('Vertical',      '2026-06-09', 'Narwahl - Lot 446- Eagle Point',                         '2026-09-07', 'Open', 0, 23),
      ('Vertical',      '2026-06-09', 'Holmes Homes _Alaia TH - 1121-1124',                     '2026-09-07', 'Open', 0, 24),
      ('Vertical',      '2026-06-09', 'Holmes Homes- Alaia SFR - 1146 Model',                   '2026-09-07', 'Open', 0, 25),
      ('Vertical',      '2026-06-09', 'Arive Homes - Temple Town Lot 4',                        '2026-09-07', 'Open', 0, 26),
      ('Finished Lots', '2026-06-09', 'Arive Homes Grandeu Estates _ 3 lots_',                  '2026-09-07', 'Open', 0, 27);
  end if;
end $$;

-- Turns each new_origination_schedule row into a recurring series that draws
-- down a lot pool instead of a single one-month cohort.
--
--   total_lots       cap on cumulative loans started by this entry (the pool).
--                     NULL / 0 = no cap (bounded only by end_month / horizon).
--   end_month         inclusive YYYY-MM calendar stop. NULL = no date stop.
--   monthly_mode      'fixed'    = originate `loan_count` loans every month
--                     'schedule' = originate monthly_schedule[YYYY-MM] loans
--   monthly_schedule  {YYYY-MM: count} used when monthly_mode = 'schedule'
--
-- The series starts at the existing `month` column and stops the month the
-- cumulative count reaches total_lots OR end_month passes, whichever is first.
--
-- Existing rows are backfilled so they keep their old single-month behavior:
-- total_lots = loan_count means the very first month exhausts the pool.

alter table new_origination_schedule
  add column if not exists total_lots       integer,
  add column if not exists end_month        text,
  add column if not exists monthly_mode     text not null default 'fixed',
  add column if not exists monthly_schedule jsonb not null default '{}'::jsonb;

update new_origination_schedule
  set total_lots = loan_count
  where total_lots is null;

-- Extends land_bucket_projects with two per-project overrides used by the
-- Land Bucket tab:
--
--   * vertical_loan_amount: dollar amount per vertical (home construction) loan
--     originated when a lot sells. NULL = fall back to the calculator's
--     lot_price × multiple default.
--
--   * lot_release_schedule: optional manual lot-release override keyed by month
--     (YYYY-MM → integer lots released that month). When populated, the engine
--     uses these counts instead of the absorption_rate-driven schedule.

alter table land_bucket_projects
  add column if not exists vertical_loan_amount numeric,
  add column if not exists lot_release_schedule jsonb not null default '{}'::jsonb;

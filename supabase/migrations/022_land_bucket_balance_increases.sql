-- Projected monthly balance increases for Land Bucket projects.
--
-- balance_increase_schedule: YYYY-MM → dollars added to the project's balance
-- that month (further land draws, development spend). The engine applies each
-- increase at the start of its month, so it shows in that month's balance and
-- earns interest from then; lot-sale paydowns still reduce the balance as
-- before. The current month is excluded: balance_outstanding is today's
-- balance, and adding this month's increase on top would double it.
--
-- Safe to run any time and re-runnable. Existing projects get '{}', i.e. no
-- change to their forecast.

alter table land_bucket_projects
  add column if not exists balance_increase_schedule jsonb not null default '{}'::jsonb;

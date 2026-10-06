-- Payoff schedules filled from a loan report (Payoff Schedules → Import).
--
-- payoff_months becomes numeric(6,1) so imported averages keep their tenths
-- (6.5 months). loan_count records how many payoffs an imported average came
-- from; source says whether the cell holds that import ('import') or a value
-- someone typed or edited ('manual').
--
-- Safe to run any time and re-runnable. Existing rows keep their values and
-- read as 'manual'.

alter table payoff_schedules
  alter column payoff_months type numeric(6,1) using payoff_months::numeric;

alter table payoff_schedules
  add column if not exists loan_count int,
  add column if not exists source text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payoff_schedules_source_check'
  ) then
    alter table payoff_schedules
      add constraint payoff_schedules_source_check check (source in ('import', 'manual'));
  end if;
end $$;

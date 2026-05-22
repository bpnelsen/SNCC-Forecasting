-- Per-entry interest rate override on new_origination_schedule.
-- NULL = use the entry's loan program's default_rate (current behaviour).
-- Non-null = the rate the forecast uses for that cohort's yield calc.

alter table new_origination_schedule
  add column if not exists interest_rate numeric;

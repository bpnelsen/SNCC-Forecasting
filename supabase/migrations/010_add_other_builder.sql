-- Adds an "Other" catch-all builder to the master list. Intended for New
-- Originations entries representing loans whose interest rates fall outside
-- the partner builders' standard programs — the per-entry interest_rate
-- override (migration 009) carries the actual rate.
--
-- default_absorption_rate is 0 because "Other" is a labeling bucket, not a
-- specific development feeding lot absorption. default_loan_program_id is
-- left null so the engine falls back to the SFR Construction program at
-- calc time (entries can override per row).
-- Idempotent via the existing unique(name) constraint.

insert into builders (name, default_absorption_rate, default_loan_program_id)
values ('Other', 0, null)
on conflict (name) do nothing;

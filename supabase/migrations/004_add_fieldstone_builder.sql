-- Adds Fieldstone to the builders master list. Mirrors the seed pattern from
-- migration 002: absorption rate matches the table default and the default
-- loan program is wired to the SFR Construction program by name so we don't
-- hardcode a UUID. Idempotent via the existing unique(name) constraint.

insert into builders (name, default_absorption_rate, default_loan_program_id)
values (
  'Fieldstone',
  2,
  (select id from loan_programs where name = 'SFR Construction')
)
on conflict (name) do nothing;

-- Finished Lots / Multi-Lot Lot Loan release schedule.
--
-- These loans no longer ramp up to projected_balance — they hold at the
-- current balance and pay down linearly over `release_period_months`,
-- each month releasing (number_of_lots / release_period_months) lots
-- × (original_loan_amount / number_of_lots) = original_loan_amount /
-- release_period_months of principal. See src/lib/calculator.ts.

alter table loans
  add column if not exists number_of_lots        int not null default 1,
  add column if not exists release_period_months int not null default 12;

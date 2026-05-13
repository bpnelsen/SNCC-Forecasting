-- Per-project vertical loan amount for lot-driven originations.
--
-- When a lot is purchased from a land bucket project, the engine originates
-- a vertical construction loan in the project's vertical_loan_program. This
-- column controls the max balance of that loan. NULL = engine falls back to
-- a default heuristic (lot_price × 3) so existing rows don't break.

alter table land_bucket_projects
  add column if not exists vertical_loan_amount numeric;

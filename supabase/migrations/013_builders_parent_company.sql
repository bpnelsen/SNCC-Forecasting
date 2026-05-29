-- Builders → Parent Companies relationship. Lets the Dashboard parent
-- filter slice every builder-attributed entity (Land Bucket, forecasted
-- cohorts, HHH/JV, A&D planned) by parent, mirroring how the existing
-- borrower → parent mapping covers imported loans.
--
-- on delete set null so removing a parent company doesn't cascade-delete the
-- builders that belonged to it.

alter table builders
  add column if not exists parent_company_id uuid references parent_companies(id) on delete set null;

create index if not exists idx_builders_parent on builders (parent_company_id);

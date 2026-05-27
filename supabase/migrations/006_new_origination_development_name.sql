-- Adds a free-text development name to new_origination_schedule so users can
-- name a development that isn't (yet) a Land Bucket project. The existing
-- land_bucket_project_id stays for cases where the user does want to link a
-- row to an existing project.

alter table new_origination_schedule
  add column if not exists development_name text;

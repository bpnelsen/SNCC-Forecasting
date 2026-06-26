-- ─────────────────────────────────────────────────────────────────────────────
-- 015_enable_rls.sql
--
-- Enables Row Level Security on every table and adds policies scoped to
-- AUTHENTICATED users only. After this runs:
--   • the anon (public) key can read/write NOTHING via the REST API
--   • signed-in users (Supabase Auth) get full read/write
--   • the service_role key used by the API routes BYPASSES RLS automatically,
--     so the app keeps working unchanged
--
-- This matches the current single-organization reality (any signed-in user is
-- trusted). Tighten later to per-user/per-org ownership by replacing
-- `using (true)` with an ownership predicate (e.g. `auth.uid() = owner_id`).
--
-- Run this entire file in the Supabase SQL Editor. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
  tables text[] := array[
    'a_and_d_loans',
    'assumptions',
    'borrower_parent_mapping',
    'builders',
    'current_report_versions',
    'forecast_settings',
    'hhh_jv_projects',
    'land_bucket_projects',
    'loan_programs',
    'loans',
    'new_origination_schedule',
    'parent_companies',
    'parent_company_patterns'
  ];
begin
  foreach t in array tables loop
    -- Only act on tables that actually exist in this database.
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'skipping % (does not exist)', t;
      continue;
    end if;

    -- Enable + force RLS (force also covers the table owner role).
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);

    -- Recreate policies idempotently.
    execute format('drop policy if exists authenticated_read on public.%I;', t);
    execute format('drop policy if exists authenticated_write on public.%I;', t);

    -- Read for any signed-in user.
    execute format(
      'create policy authenticated_read on public.%I for select to authenticated using (true);',
      t
    );

    -- Insert / update / delete for any signed-in user.
    execute format(
      'create policy authenticated_write on public.%I for all to authenticated using (true) with check (true);',
      t
    );

    raise notice 'RLS enabled + policies applied on %', t;
  end loop;
end $$;

-- ── Verification (optional) ──────────────────────────────────────────────────
-- Every table below should show rowsecurity = true:
--   select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- And each should have the two policies:
--   select tablename, policyname, roles, cmd from pg_policies where schemaname = 'public';

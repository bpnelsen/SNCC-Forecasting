-- Enable Row Level Security on every application table.
--
-- WHY: NEXT_PUBLIC_SUPABASE_ANON_KEY ships in the browser bundle, so the
-- Supabase REST endpoint (https://<ref>.supabase.co/rest/v1/...) is reachable
-- by anyone who views source — completely independently of this app's routes
-- and middleware. Without RLS, that key can read and write every table.
--
-- POLICY MODEL: deliberately no policies at all.
--
-- The app reads and writes exclusively through /api/* route handlers, which use
-- the SERVICE ROLE key. The service role carries BYPASSRLS, so the app keeps
-- working unchanged. Meanwhile `anon` and `authenticated` have zero policies,
-- and RLS-enabled-with-no-policy is deny-all, so direct REST access is closed.
--
-- Consequence: if you later want the browser to query Supabase directly rather
-- than via /api, you must add explicit policies here first.
--
-- Idempotent: `enable row level security` is a no-op when already enabled.

alter table current_report_versions   enable row level security;
alter table loans                     enable row level security;
alter table assumptions               enable row level security;
alter table loan_programs             enable row level security;
alter table builders                  enable row level security;
alter table land_bucket_projects      enable row level security;
alter table forecast_settings         enable row level security;
alter table new_origination_schedule  enable row level security;
alter table hhh_jv_projects           enable row level security;
alter table a_and_d_loans             enable row level security;
alter table parent_companies          enable row level security;
alter table parent_company_patterns   enable row level security;
alter table borrower_parent_mapping   enable row level security;
-- Added by migration 016.
alter table approved_loans            enable row level security;

-- Belt and braces: revoke the blanket grants Supabase hands the two public API
-- roles. RLS alone already reduces them to zero rows, but revoking turns a
-- silent empty result into a hard "permission denied", and means a future
-- accidental "allow all" policy still can't be reached from the browser.
--
-- service_role is deliberately NOT touched — it is the role /api/* uses via
-- SUPABASE_SERVICE_ROLE_KEY, and it has BYPASSRLS, so the app is unaffected.
do $$
declare
  t text;
begin
  foreach t in array array[
    'current_report_versions','loans','assumptions','loan_programs','builders',
    'land_bucket_projects','forecast_settings','new_origination_schedule',
    'hhh_jv_projects','a_and_d_loans','parent_companies',
    'parent_company_patterns','borrower_parent_mapping','approved_loans'
  ]
  loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Catch-all so a table added in a later migration can't silently miss RLS.
-- Everything in `public` that this app owns should be covered above; this
-- turns anything new on too rather than leaving it exposed.
do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and not c.relrowsecurity
  loop
    raise notice 'Enabling RLS on previously unprotected table: %', r.relname;
    execute format('alter table public.%I enable row level security', r.relname);
    execute format('revoke all on table public.%I from anon, authenticated', r.relname);
  end loop;
end $$;

-- Sanity check:
--   select relname, relrowsecurity from pg_class
--   where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname;

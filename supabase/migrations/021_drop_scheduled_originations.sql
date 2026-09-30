-- Drops the orphaned `scheduled_originations` table.
--
-- WHY: Supabase's linter flagged it as "RLS Disabled in Public" — it sat in the
-- public schema, so PostgREST exposed it to anyone holding the anon key (which
-- ships in the browser bundle). Migration 020's catch-all closed that hole, but
-- the table shouldn't exist at all: it appears in NO migration and NO code path
-- (the app's real table is `new_origination_schedule`). It's drift left behind
-- in the live database, almost certainly a pre-rename ancestor of that table.
--
-- SAFETY: this refuses to drop a table that still has rows. It was reported as
-- empty, but the migration verifies that itself rather than trusting the
-- report — a `drop table` is irreversible and there is no down migration.
-- If it turns out to hold data, this aborts with the row count so the data can
-- be reviewed (and migrated into new_origination_schedule) first.
--
-- Deliberately NOT `drop table ... cascade`. If some view or foreign key
-- depends on this table, Postgres raises an error naming the dependent object,
-- which is what we want — cascade would silently destroy it too.
--
-- Idempotent, and safe on a fresh database where the table never existed:
-- both cases are a no-op.

do $$
declare
  row_count bigint;
begin
  if not exists (
    select 1
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and c.relname = 'scheduled_originations'
  ) then
    raise notice 'scheduled_originations does not exist — nothing to drop.';
    return;
  end if;

  execute 'select count(*) from public.scheduled_originations' into row_count;

  if row_count > 0 then
    raise exception
      'Refusing to drop public.scheduled_originations: it still has % row(s). '
      'Review them first — if they matter, migrate them into '
      'new_origination_schedule; if they do not, empty the table and re-run '
      'this migration.',
      row_count;
  end if;

  raise notice 'Dropping empty orphaned table public.scheduled_originations.';
  execute 'drop table public.scheduled_originations';
end $$;

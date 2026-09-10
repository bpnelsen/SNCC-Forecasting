-- Renames each builder with an assigned parent_company_id to match that
-- parent's name, so the Land Bucket / New Originations / etc. dropdowns
-- show builders with their parent-company-aligned names.
--
-- Aborts with a clear error listing every conflict if any rename would
-- collide with an existing builder name (builders.name has a UNIQUE
-- constraint), so the user can clean up manually before re-running.
--
-- Builders without a parent_company_id are left alone. FK-safe — every
-- table that references builders does so by id.

do $$
declare
  conflicts text;
begin
  with planned as (
    select b.id   as builder_id,
           b.name as old_name,
           p.name as new_name
    from builders b
    join parent_companies p on p.id = b.parent_company_id
    where b.name <> p.name
  ),
  collisions as (
    -- A rename "collides" when the target name is already used by a
    -- different builder. Covers both direct duplicates and cross-renames
    -- (A → B, B → A) — both halves get flagged so the user sees the cycle.
    select pl.old_name || ' -> ' || pl.new_name
           || ' (already used by builder ' || other.id || ')'
           as conflict
    from planned pl
    join builders other
      on other.name = pl.new_name
     and other.id  <> pl.builder_id

    union all

    -- Two or more builders sharing ONE parent both target the same new name.
    -- Neither collides with an *existing* builder, so the check above misses
    -- them and the UPDATE below used to fail with a raw unique-constraint
    -- error instead of this message. builders.name is UNIQUE, so this case is
    -- unsatisfiable by design — the user has to decide which builder keeps the
    -- parent's name (or clear parent_company_id on the others) before re-running.
    select 'multiple builders map to parent "' || pl.new_name || '": '
           || string_agg(pl.old_name, ', ' order by pl.old_name)
           || ' — builders.name is UNIQUE, so they cannot all take that name'
           as conflict
    from planned pl
    group by pl.new_name
    having count(*) > 1
  )
  select string_agg(conflict, '; ') into conflicts from collisions;

  if conflicts is not null then
    raise exception
      'Cannot rename builders to match parent companies; conflicts: %',
      conflicts;
  end if;

  update builders b
  set name       = p.name,
      updated_at = now()
  from parent_companies p
  where b.parent_company_id = p.id
    and b.name <> p.name;
end $$;

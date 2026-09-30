// Saving Land Bucket projects' balance_increase_schedule (migration 022).
//
// Every push to the production branch deploys immediately, but the column only
// exists once migration 022 has been run in Supabase. Writing it
// unconditionally would make EVERY Land Bucket save fail until then. So the
// routes write it, and if Postgres reports the column missing:
//   - an empty schedule is retried without it — nothing is lost, and the
//     existing workflow keeps working before the migration;
//   - a non-empty one returns MIGRATION_022_MESSAGE, which says what to run,
//     rather than silently dropping the user's increases.

export const MIGRATION_022_MESSAGE =
  'Projected balance increases need a database update first: run ' +
  'supabase/migrations/022_land_bucket_balance_increases.sql in the Supabase ' +
  'SQL editor, then save again. Everything else on this project saves normally.'

/** Keep YYYY-MM keys with positive, finite dollar amounts; drop the rest. */
export function cleanIncreaseSchedule(value: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(v)
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(k) && Number.isFinite(n) && n > 0) out[k] = n
  }
  return out
}

/** Postgres / PostgREST's way of saying the column doesn't exist yet. */
export function isMissingIncreaseColumn(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string }
  const mentions = (e.message ?? '').includes('balance_increase_schedule')
  return mentions && (e.code === 'PGRST204' || e.code === '42703' || /column|schema cache/i.test(e.message ?? ''))
}

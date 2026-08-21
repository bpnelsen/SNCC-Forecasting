/**
 * Supabase caps a single select at the project's "Max rows" setting
 * (Settings → API, default 1,000). A plain `.select('*')` on a table with more
 * rows than that returns the first page and no error at all — the forecast
 * would quietly compute on a truncated loan book.
 *
 * fetchAll pages with .range() until a short page comes back, so callers get
 * every row or a real error.
 */
export const PAGE_SIZE = 1000

/**
 * Structural type covering just what we call. PostgrestFilterBuilder's own
 * generic signature changes shape between @supabase/supabase-js releases, and
 * naming it here made this file fail to compile on a patch bump — this only
 * needs `.range()`.
 */
export interface RangeQuery<T> {
  range(from: number, to: number): PromiseLike<{
    data: T[] | null
    error: { message: string } | null
  }>
}

export async function fetchAll<T>(
  query: RangeQuery<T>,
  pageSize: number = PAGE_SIZE,
): Promise<{ data: T[]; error: null } | { data: null; error: Error }> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) return { data: null, error: new Error(error.message) }
    const page = data ?? []
    out.push(...page)
    // A short page means we've reached the end.
    if (page.length < pageSize) break
    // Safety valve: refuse to loop forever if the server ignores range.
    if (out.length > 500_000) {
      return {
        data: null,
        error: new Error(
          `Refusing to page past ${out.length} rows — check the query's filters.`,
        ),
      }
    }
  }
  return { data: out, error: null }
}

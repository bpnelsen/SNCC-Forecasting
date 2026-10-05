import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Land Bucket saves before migration 022 has been run.
 *
 * Every push deploys to production immediately, but the
 * balance_increase_schedule column only exists once the migration is run in
 * Supabase. These pin that saves keep working without it, and that a save
 * which would lose projected increases says what to do instead of failing
 * obscurely or silently dropping them.
 */

// Each update() records the row it was given and returns the next queued
// result, so a test can make the first attempt fail and the retry succeed.
const rows: Record<string, unknown>[] = []
let results: { data: unknown; error: unknown }[] = []
const update = vi.fn((row: Record<string, unknown>) => {
  rows.push(row)
  const r = results.shift() ?? { data: { id: 'p1' }, error: null }
  return { eq: () => ({ select: () => ({ single: () => Promise.resolve(r) }) }) }
})
vi.mock('@/lib/supabase', () => ({ createServiceClient: () => ({ from: () => ({ update }) }) }))

const { POST } = await import('./route')

const MISSING = {
  code: 'PGRST204',
  message: "Could not find the 'balance_increase_schedule' column of 'land_bucket_projects' in the schema cache",
}
const save = (body: Record<string, unknown>) =>
  POST(new Request('http://localhost/api/land-bucket-projects/p1', {
    method: 'POST', body: JSON.stringify({ name: 'Willow Creek', ...body }),
  }) as never, { params: Promise.resolve({ id: 'p1' }) })

beforeEach(() => { rows.length = 0; results = []; update.mockClear() })

describe('POST /api/land-bucket-projects/[id] before migration 022', () => {
  it('writes the schedule when the column exists', async () => {
    const res = await save({ balance_increase_schedule: { '2027-01': 250_000 } })
    expect(res.status).toBe(200)
    expect(rows).toHaveLength(1)
    expect(rows[0].balance_increase_schedule).toEqual({ '2027-01': 250_000 })
  })

  it('still saves a project with no increases, by retrying without the column', async () => {
    results = [{ data: null, error: MISSING }, { data: { id: 'p1' }, error: null }]
    const res = await save({ balance_increase_schedule: {} })
    expect(res.status).toBe(200)
    expect(rows).toHaveLength(2)
    expect(rows[1]).not.toHaveProperty('balance_increase_schedule')
    expect(rows[1].name).toBe('Willow Creek')
  })

  it('refuses to drop increases silently, and says which migration to run', async () => {
    results = [{ data: null, error: MISSING }]
    const res = await save({ balance_increase_schedule: { '2027-01': 250_000 } })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/022_land_bucket_balance_increases\.sql/)
    expect(rows).toHaveLength(1)   // no retry that would discard them
  })

  it('does not mask unrelated database errors as the migration', async () => {
    results = [{ data: null, error: { code: '23505', message: 'duplicate key value' } }]
    const res = await save({ balance_increase_schedule: {} })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/duplicate key/)
  })

  it('drops junk entries before writing', async () => {
    await save({ balance_increase_schedule: { '2027-01': 100, '2027-13': 5, 'x': 5, '2027-02': -3, '2027-03': 'abc' } })
    expect(rows[0].balance_increase_schedule).toEqual({ '2027-01': 100 })
  })
})

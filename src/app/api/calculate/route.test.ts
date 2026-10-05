import { describe, it, expect, vi } from 'vitest'

/**
 * ?horizon= on the real route: the Dashboard's 6/9/12/18/24 buttons must get
 * exactly that many months back, and anything else must fall back to the
 * stored forecast_settings.horizon_months rather than be trusted.
 */

const STORED_HORIZON = 17
const tables: Record<string, unknown[]> = {
  current_report_versions: [{ id: 'v1', label: 'test', is_active: true, as_of_date: '2026-09-30' }],
  forecast_settings: [{
    id: 's1', start_date: '2020-01-01', horizon_months: STORED_HORIZON,
    default_rate_vertical: 0.05, default_rate_land: 0.05, is_active: true,
  }],
}

// Minimal chainable stand-in for the Supabase query builder: filters are
// no-ops, awaiting gives every row, .range() pages, .single() gives the first.
function query(table: string) {
  const rows = tables[table] ?? []
  const q = {
    select: () => q, eq: () => q, order: () => q,
    single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
    then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null, count: rows.length }).then(ok, bad),
  }
  return q
}
vi.mock('@/lib/supabase', () => ({ createServiceClient: () => ({ from: query }) }))

const { GET } = await import('./route')
const monthsFor = async (qs: string) => {
  const res = await GET(new Request(`http://localhost/api/calculate${qs}`))
  expect(res.status).toBe(200)
  return (await res.json()).months.length as number
}

describe('GET /api/calculate ?horizon=', () => {
  it('returns exactly the chosen number of months', async () => {
    for (const h of [6, 9, 12, 18, 24]) expect(await monthsFor(`?horizon=${h}`)).toBe(h)
  })

  it('uses the stored horizon when none is given', async () => {
    expect(await monthsFor('')).toBe(STORED_HORIZON)
  })

  it('ignores values the selector does not offer', async () => {
    for (const bad of ['17', '36', '1000', '0', 'abc']) {
      expect(await monthsFor(`?horizon=${bad}`)).toBe(STORED_HORIZON)
    }
  })
})

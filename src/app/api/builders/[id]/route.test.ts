import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Covers the Next 15 async-request-API contract for a dynamic route handler.
 *
 * In Next 15 `params` arrives as a Promise, so it has to be awaited before the
 * key can be read. TypeScript catches a missing `await params` (the destructured
 * name would be undeclared), but it cannot prove the awaited value is threaded
 * into the query — that's what these assert.
 *
 * Also pins the ordering that matters for security: requireUser() must run
 * before the handler touches the service-role client at all.
 */

const eq = vi.fn()
const del = vi.fn(() => ({ eq }))
const update = vi.fn(() => ({ eq: vi.fn(() => ({ select: () => ({ single: () => ({ data: { id: 'x' }, error: null }) }) })) }))
const from = vi.fn(() => ({ delete: del, update }))
const createServiceClient = vi.fn(() => ({ from }))
const requireUser = vi.fn<() => Promise<Response | null>>()

vi.mock('@/lib/supabase', () => ({ createServiceClient: () => createServiceClient() }))
vi.mock('@/lib/auth', () => ({ requireUser: () => requireUser() }))

// Imported after the mocks are registered.
const { DELETE } = await import('./route')

beforeEach(() => {
  vi.clearAllMocks()
  eq.mockReturnValue({ error: null })
  requireUser.mockResolvedValue(null)
})

const req = new Request('http://localhost/api/builders/abc', { method: 'DELETE' })

describe('DELETE /api/builders/[id] — Next 15 async params', () => {
  it('awaits the params Promise and uses the resolved id in the query', async () => {
    const res = await DELETE(req as never, { params: Promise.resolve({ id: 'builder-123' }) })

    expect(res.status).toBe(200)
    expect(from).toHaveBeenCalledWith('builders')
    // The id must be the resolved string, not a Promise and not undefined.
    expect(eq).toHaveBeenCalledWith('id', 'builder-123')
  })

  it('does not pass a Promise or undefined through to the query', async () => {
    await DELETE(req as never, { params: Promise.resolve({ id: 'builder-456' }) })

    const [, value] = eq.mock.calls[0]
    expect(typeof value).toBe('string')
    expect(value).not.toBeInstanceOf(Promise)
    expect(value).toBe('builder-456')
  })

  it('rejects an unauthenticated caller before creating a service client', async () => {
    requireUser.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Not authenticated.' }), { status: 401 }),
    )

    const res = await DELETE(req as never, { params: Promise.resolve({ id: 'builder-123' }) })

    expect(res.status).toBe(401)
    // The service-role key must never be reached without a session.
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })

  it('surfaces a database error as a 500', async () => {
    eq.mockReturnValue({ error: { message: 'boom' } })

    const res = await DELETE(req as never, { params: Promise.resolve({ id: 'builder-123' }) })

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining('boom') })
  })
})

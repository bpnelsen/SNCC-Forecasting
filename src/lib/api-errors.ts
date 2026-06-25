import { NextResponse } from 'next/server'

/**
 * Centralized API error response.
 *
 * Logs the full error server-side (visible in Vercel/host logs) but returns a
 * generic message to the client so we never leak table names, column names,
 * SQL, or stack details to callers. Use this in every route's catch block.
 */
export function apiError(e: unknown, status = 500) {
  // Full detail stays on the server only.
  console.error('[api error]', e)
  return NextResponse.json(
    { error: 'An internal error occurred. Please try again or contact support.' },
    { status },
  )
}

/** 401 helper for unauthenticated requests. */
export function unauthorized() {
  return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
}

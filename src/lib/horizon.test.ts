import { describe, it, expect } from 'vitest'
import { parseHorizon, HORIZON_OPTIONS, DEFAULT_HORIZON } from './horizon'

describe('parseHorizon', () => {
  it('accepts exactly the offered horizons, from strings or numbers', () => {
    for (const h of HORIZON_OPTIONS) {
      expect(parseHorizon(h)).toBe(h)
      expect(parseHorizon(String(h))).toBe(h)
    }
  })
  it('rejects anything else, so the API never runs an arbitrary length', () => {
    for (const bad of [null, undefined, '', '0', '17', '36', '1000', '12.5', 'abc', -6]) {
      expect(parseHorizon(bad)).toBeNull()
    }
  })
  it('defaults to an offered option', () => {
    expect(HORIZON_OPTIONS).toContain(DEFAULT_HORIZON)
  })
})

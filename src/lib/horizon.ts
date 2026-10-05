// Forecast horizons the Dashboard offers. Shared by the selector and by
// /api/calculate's ?horizon= check, so a button can never request a value the
// API would reject, and the API never trusts an arbitrary (expensive) length.
export const HORIZON_OPTIONS = [6, 9, 12, 18, 24] as const
export type Horizon = (typeof HORIZON_OPTIONS)[number]

// 18 is the nearest option to the long-standing 17-month default
// (forecast_settings.horizon_months), so the first view looks as before.
export const DEFAULT_HORIZON: Horizon = 18

export function parseHorizon(value: unknown): Horizon | null {
  const n = Number(value)
  return (HORIZON_OPTIONS as readonly number[]).includes(n) ? (n as Horizon) : null
}

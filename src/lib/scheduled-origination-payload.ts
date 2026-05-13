export function pickScheduledOriginationPayload(body: Record<string, unknown>) {
  // forecast_month may arrive as "YYYY-MM" (from <input type="month">) or "YYYY-MM-DD".
  // Normalise to the first of the month so the engine's month-key match works.
  let month: string | null = null
  const raw = body.forecast_month
  if (typeof raw === 'string' && raw) {
    month = /^\d{4}-\d{2}$/.test(raw) ? `${raw}-01` : raw
  }
  return {
    builder_id:          body.builder_id || null,
    loan_program_id:     String(body.loan_program_id ?? ''),
    forecast_month:      month,
    count:               Number(body.count ?? 0),
    max_amount_per_loan: Number(body.max_amount_per_loan ?? 0),
    notes:               body.notes ? String(body.notes) : null,
  }
}

export function pickBuilderPayload(body: Record<string, unknown>) {
  return {
    name:                    String(body.name ?? '').trim(),
    default_absorption_rate: Number(body.default_absorption_rate ?? 0),
    default_loan_program_id: body.default_loan_program_id || null,
    notes:                   body.notes ? String(body.notes) : null,
  }
}

export function pickProgramPayload(body: Record<string, unknown>) {
  const curve = Array.isArray(body.draw_curve)
    ? body.draw_curve.map(v => Number(v))
    : []
  return {
    name:                String(body.name ?? '').trim(),
    product_type:        String(body.product_type ?? 'OTHER'),
    draw_curve:          curve,
    default_rate:        Number(body.default_rate ?? 0.0525),
    default_term_months: Number(body.default_term_months ?? 18),
    notes:               body.notes ? String(body.notes) : null,
  }
}

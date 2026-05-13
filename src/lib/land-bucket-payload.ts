export function pickLandBucketPayload(body: Record<string, unknown>) {
  const num = (v: unknown) => (v === '' || v == null ? null : Number(v))
  return {
    name:                      String(body.name ?? '').trim(),
    builder_id:                body.builder_id || null,
    total_lots:                Number(body.total_lots ?? 0),
    lot_price:                 Number(body.lot_price ?? 0),
    absorption_rate:           num(body.absorption_rate),
    balance_outstanding:       Number(body.balance_outstanding ?? 0),
    interest_rate:             Number(body.interest_rate ?? 0.0525),
    dev_start_date:            body.dev_start_date || null,
    dev_end_date:              body.dev_end_date || null,
    lot_sales_start_date:      body.lot_sales_start_date || null,
    vertical_loan_program_id:  body.vertical_loan_program_id || null,
    vertical_loan_amount:      num(body.vertical_loan_amount),
    notes:                     body.notes ? String(body.notes) : null,
  }
}

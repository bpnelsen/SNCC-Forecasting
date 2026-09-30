'use client'

import { effectiveDraw } from '@/lib/calculator'
import type { LoanProgram } from '@/lib/types'

/**
 * Editor for a loan program's draw curve.
 *
 * Shared by Assumptions → Loan Programs and the New Originations draw-curve
 * shortcut, which previously carried two copies of this grid that had to be
 * kept in step by hand.
 *
 * The curve is stored as incremental monthly fractions of each loan's amount.
 * Three things about how the engine reads it are easy to get wrong, so the
 * editor states all three rather than just printing the raw sum:
 *
 *  - Entries past `default_term_months` never apply: the engine zeroes a
 *    cohort's balance once it reaches the term. Those months are dead.
 *  - The live entries should sum to 100%. Below that, loans never fully fund
 *    and the forecast is quietly short by the difference.
 *  - Above 100% the engine clamps, so the surplus is silently discarded.
 */
export function DrawCurveEditor({
  program, onChange, minMonths = 24, showHeader = true,
}: {
  program: LoanProgram
  onChange: (curve: number[]) => void
  /** Always show at least this many cells, so short curves are easy to extend. */
  minMonths?: number
  /**
   * Render the program name / product type / rate / term line. Off where the
   * host already shows those, and makes rate and term editable (Assumptions).
   */
  showHeader?: boolean
}) {
  const stored = program.draw_curve ?? []
  const cells = Math.max(minMonths, stored.length)
  const eff = effectiveDraw(program)
  const pct = Math.round(eff.pct * 100)
  const rawPct = Math.round(eff.rawPct * 100)

  // Write back only as many entries as the user has actually populated, plus
  // the one being edited. Padding to `cells` on every keystroke used to turn a
  // 12-month curve into a 24-month one full of trailing zeros the moment you
  // touched any cell — which is how a program's label drifts from "12 mo" to
  // "24 mo" with nobody having asked for it.
  const setMonth = (i: number, value: number) => {
    const next = Array.from(
      { length: Math.max(stored.length, i + 1) },
      (_, j) => stored[j] ?? 0,
    )
    next[i] = value
    // Drop trailing zeros so the stored length stays honest about the curve.
    while (next.length > 0 && next[next.length - 1] === 0) next.pop()
    onChange(next)
  }

  const normalize = () => {
    const live = stored.slice(0, Math.max(1, Math.min(stored.length, program.default_term_months)))
    const sum = live.reduce((a, b) => a + (Number(b) || 0), 0)
    if (sum <= 0) return
    // Scale the live months to exactly 1.0 and drop anything past the term,
    // which the engine ignores anyway.
    onChange(live.map(v => (Number(v) || 0) / sum))
  }

  return (
    <div className={showHeader ? 'border border-border-strong rounded-lg p-3 space-y-2' : 'space-y-2'}>
      <div className="flex items-center justify-between gap-2">
        {showHeader ? (
          <div>
            <div className="text-xs font-medium text-fg">{program.name}</div>
            <div className="text-[10px] text-fg-dim">
              Product type: {program.product_type} · default rate {(program.default_rate * 100).toFixed(2)}%
              · term {program.default_term_months} mo
            </div>
          </div>
        ) : (
          <div className="text-[10px] text-fg-dim">
            Draw curve — incremental % of each loan drawn per month (should sum to 100%)
          </div>
        )}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="btn-ghost text-[10px] px-1.5 py-0.5 disabled:opacity-40"
            disabled={pct === 100}
            title="Scale the months inside the term so they sum to exactly 100%"
            onClick={normalize}
          >Normalize</button>
          <button
            type="button"
            className="btn-ghost text-[10px] px-1.5 py-0.5"
            onClick={() => onChange(Array.from({ length: stored.length + 1 }, (_, j) => stored[j] ?? 0))}
          >+ Month</button>
          <button
            type="button"
            className="btn-ghost text-[10px] px-1.5 py-0.5 disabled:opacity-40"
            disabled={stored.length <= 1}
            onClick={() => onChange(stored.slice(0, stored.length - 1))}
          >− Month</button>
        </div>
      </div>

      <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
        {Array.from({ length: cells }, (_, i) => {
          // A cell past the term can be typed into but will never fund
          // anything, so mark it rather than letting it look live.
          const dead = i >= program.default_term_months
          return (
            <div key={i}>
              <div className={`text-[10px] mb-0.5 text-center ${dead ? 'text-danger' : 'text-fg-dim'}`}>
                M{i + 1}
              </div>
              <input
                type="number"
                // Whole percents alone cannot express an even spread over most
                // terms (100/24 = 4.1667), which is the main reason curves end
                // up summing to something other than 100%.
                step="0.1"
                min="0"
                className="form-input text-right text-xs"
                title={dead
                  ? `Past the ${program.default_term_months}-month term — the forecast ignores this month`
                  : undefined}
                value={Number(((stored[i] ?? 0) * 100).toFixed(2))}
                onChange={e => {
                  const v = Number(e.target.value)
                  setMonth(i, !isFinite(v) || v < 0 ? 0 : v / 100)
                }}
              />
            </div>
          )
        })}
      </div>

      <div className="text-[10px] text-fg-dim">
        Draws <span className={pct === 100 ? 'text-fg' : 'text-danger font-medium'}>{pct}%</span>
        {' '}of each loan over {eff.drawMonths} month{eff.drawMonths === 1 ? '' : 's'},
        then holds until the {program.default_term_months}-month term ends.
      </div>

      {eff.deadMonths > 0 && (
        <div className="text-[10px] text-danger">
          {eff.deadMonths} month{eff.deadMonths === 1 ? '' : 's'} of this curve fall past the{' '}
          {program.default_term_months}-month term and are ignored by the forecast. The stored curve
          sums to {rawPct}%, but only {pct}% is ever drawn. Shorten the curve or raise the term.
        </div>
      )}
      {pct < 100 && (
        <div className="text-[10px] text-danger">
          These loans never reach their full amount — each one peaks at {pct}% of its
          avg loan amount, so forecast balances for this program are {100 - pct}% short of
          commitment. Use Normalize if the curve is meant to fund 100%.
        </div>
      )}
      {eff.clamped && (
        <div className="text-[10px] text-danger">
          The months inside the term sum to more than 100%; the engine caps each loan at 100%,
          so the surplus is discarded.
        </div>
      )}
    </div>
  )
}

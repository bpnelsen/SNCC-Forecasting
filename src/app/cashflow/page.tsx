'use client'

import { useEffect, useState, useMemo } from 'react'
import { ForecastResult, MonthlyBalance } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import {
  BarChart, Bar, Line, ComposedChart, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { Wallet, AlertCircle } from 'lucide-react'

interface CashFlowRow {
  month: string
  label: string
  interest: number      // total_income (active + projected + land bucket)
  payoffs: number       // payoffs_amount
  lot_proceeds: number  // lot_sale_proceeds
  draws: number         // estimated net increase in vertical balances (negative cash)
  net: number           // cash_flow as computed server-side
  payoffs_count: number
  new_originations_count: number
  new_originations_amount: number
  lots_sold: number
}

export default function CashflowPage() {
  const [data, setData]       = useState<ForecastResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/calculate')
      .then(r => r.ok ? r.json() : r.json().then((e: any) => Promise.reject(e.error)))
      .then(setData)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const rows: CashFlowRow[] = useMemo(() => {
    if (!data) return []
    return data.months.map((m, i) => {
      const prevLoans = i === 0 ? m.total_loans : data.months[i - 1].total_loans
      const draws = Math.max(0, m.total_loans - prevLoans)
      return {
        month: m.month,
        label: m.label,
        interest: m.total_income,
        payoffs: m.payoffs_amount,
        lot_proceeds: m.lot_sale_proceeds,
        draws,
        net: m.cash_flow,
        payoffs_count: m.payoffs_count,
        new_originations_count: m.new_originations_count,
        new_originations_amount: m.new_originations_amount,
        lots_sold: m.lots_sold,
      }
    })
  }, [data])

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({
      interest:     acc.interest     + r.interest,
      payoffs:      acc.payoffs      + r.payoffs,
      lot_proceeds: acc.lot_proceeds + r.lot_proceeds,
      draws:        acc.draws        + r.draws,
      net:          acc.net          + r.net,
    }),
    { interest: 0, payoffs: 0, lot_proceeds: 0, draws: 0, net: 0 },
  ), [rows])

  if (loading) return <div className="p-6 text-[#8B949E] text-sm">Loading cash flow…</div>
  if (error)   return (
    <div className="p-6 flex gap-2 text-sm text-[#F85149]">
      <AlertCircle className="w-4 h-4 mt-0.5" />{error}
    </div>
  )
  if (!data) return null

  return (
    <div className="p-6 space-y-6">
      <div className="fade-up fade-up-1">
        <h1 className="text-lg font-medium text-[#E6EDF3] flex items-center gap-2">
          <Wallet className="w-5 h-5 text-[#D4A853]" />
          Cash Flow
        </h1>
        <p className="text-xs text-[#8B949E] mt-0.5">
          {data.version_label} · {data.months.length}-month horizon · positive = cash to SNCC
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 fade-up fade-up-2">
        <Kpi label="Interest Income (Σ)" value={formatCurrency(totals.interest, true)} positive />
        <Kpi label="Payoffs (Σ)"         value={formatCurrency(totals.payoffs, true)} positive />
        <Kpi label="Lot Proceeds (Σ)"    value={formatCurrency(totals.lot_proceeds, true)} positive />
        <Kpi label="New Draws (Σ)"       value={formatCurrency(totals.draws, true)} negative />
        <Kpi label="Net Cash Flow (Σ)"   value={formatCurrency(totals.net, true)} accent />
      </div>

      {/* Chart */}
      <div className="card fade-up fade-up-3">
        <div className="card-header">
          <span className="card-title">Monthly Cash Flow</span>
        </div>
        <div className="p-4">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={rows.map(r => ({ ...r, draws_neg: -r.draws }))} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262D" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#8B949E', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#8B949E', fontSize: 10 }} tickLine={false} axisLine={false}
                     tickFormatter={v => formatCurrency(v, true)} width={60} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: '10px', color: '#8B949E' }} />
              <ReferenceLine y={0} stroke="#30363D" />
              <Bar dataKey="interest"     name="Interest"     fill="#58A6FF" stackId="pos" />
              <Bar dataKey="payoffs"      name="Payoffs"      fill="#3FB950" stackId="pos" />
              <Bar dataKey="lot_proceeds" name="Lot Proceeds" fill="#79C0FF" stackId="pos" radius={[2,2,0,0]} />
              <Bar dataKey="draws_neg"    name="New Draws"    fill="#F85149" stackId="neg" radius={[0,0,2,2]} />
              <Line type="monotone" dataKey="net" name="Net Cash Flow" stroke="#D4A853" strokeWidth={2} dot={{ r: 3, fill: '#D4A853' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detail table */}
      <div className="card fade-up fade-up-4">
        <div className="card-header">
          <span className="card-title">Monthly Detail</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="text-right">Interest</th>
                <th className="text-right">Payoffs #</th>
                <th className="text-right">Payoffs $</th>
                <th className="text-right">Lots Sold</th>
                <th className="text-right">Lot Proceeds</th>
                <th className="text-right">New Origs #</th>
                <th className="text-right">New Origs $</th>
                <th className="text-right">New Draws</th>
                <th className="text-right">Net Cash Flow</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.month}>
                  <td className="text-[#C9D1D9] font-medium">{r.label}</td>
                  <td className="num text-[#58A6FF]">{formatCurrency(r.interest, true)}</td>
                  <td className="num">{r.payoffs_count || '—'}</td>
                  <td className="num text-[#3FB950]">{r.payoffs ? formatCurrency(r.payoffs, true) : '—'}</td>
                  <td className="num">{r.lots_sold || '—'}</td>
                  <td className="num text-[#79C0FF]">{r.lot_proceeds ? formatCurrency(r.lot_proceeds, true) : '—'}</td>
                  <td className="num">{r.new_originations_count || '—'}</td>
                  <td className="num text-[#8B949E]">{r.new_originations_amount ? formatCurrency(r.new_originations_amount, true) : '—'}</td>
                  <td className="num text-[#F85149]">{r.draws ? `−${formatCurrency(r.draws, true)}` : '—'}</td>
                  <td className={`num font-medium ${r.net >= 0 ? 'text-[#D4A853]' : 'text-[#F85149]'}`}>
                    {r.net >= 0 ? '' : '−'}{formatCurrency(Math.abs(r.net), true)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-[#21262D] bg-[#21262D]/40">
                <td className="text-[#E6EDF3] font-medium">Total</td>
                <td className="num text-[#58A6FF] font-medium">{formatCurrency(totals.interest, true)}</td>
                <td className="num">—</td>
                <td className="num text-[#3FB950] font-medium">{formatCurrency(totals.payoffs, true)}</td>
                <td className="num">—</td>
                <td className="num text-[#79C0FF] font-medium">{formatCurrency(totals.lot_proceeds, true)}</td>
                <td className="num">—</td>
                <td className="num">—</td>
                <td className="num text-[#F85149] font-medium">−{formatCurrency(totals.draws, true)}</td>
                <td className={`num font-medium ${totals.net >= 0 ? 'text-[#D4A853]' : 'text-[#F85149]'}`}>
                  {totals.net >= 0 ? '' : '−'}{formatCurrency(Math.abs(totals.net), true)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, accent, positive, negative }: {
  label: string; value: string; accent?: boolean; positive?: boolean; negative?: boolean
}) {
  const color = accent
    ? 'text-[#D4A853]'
    : positive ? 'text-[#3FB950]'
    : negative ? 'text-[#F85149]'
    : 'text-[#E6EDF3]'
  return (
    <div className={`card p-4 ${accent ? 'border-[#D4A853]/30' : ''}`}>
      <div className="text-[10px] font-medium text-[#8B949E] uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-xl font-semibold font-mono ${color}`}>{value}</div>
    </div>
  )
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  // Recharts passes the negative draws_neg value; reverse for display
  return (
    <div className="bg-[#161B22] border border-[#21262D] rounded-lg p-3 shadow-xl text-xs">
      <div className="text-[#E6EDF3] font-medium mb-2">{label}</div>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-[#8B949E]">{entry.name}</span>
          </div>
          <span className="font-mono text-[#C9D1D9]">{formatCurrency(entry.value, true)}</span>
        </div>
      ))}
    </div>
  )
}

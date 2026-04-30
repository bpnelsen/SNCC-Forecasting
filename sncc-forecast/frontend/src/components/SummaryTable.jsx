import React from 'react'

const fmt = (val) => {
  if (val == null) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(val)
}

const ROWS = [
  { key: 'sfr', label: 'SFR', bold: false },
  { key: 'mf', label: 'Multifamily', bold: false },
  { key: 'ad', label: 'A&D', bold: false },
  { key: 'raw_land', label: 'Raw Land', bold: false },
  { key: 'finished_lots', label: 'Finished Lots', bold: false },
  { key: 'total_loans', label: 'Total Loans', bold: true, separator: true },
  { key: 'land_bucket', label: 'Land Bucket', bold: false },
  { key: 'hhh', label: 'HHH Investments', bold: false },
  { key: 'total_all', label: 'Total ALL', bold: true, separator: true },
  { key: 'variance', label: 'Variance', bold: false, variance: true },
]

export default function SummaryTable({ data }) {
  if (!data || !data.months) {
    return (
      <div className="text-center text-gray-400 py-8">
        No summary data available. Import data to get started.
      </div>
    )
  }

  const months = data.months.map(m => {
    const d = new Date(m + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-800 text-white">
            <th className="text-left px-4 py-2 font-semibold sticky left-0 bg-slate-800 min-w-[140px]">
              Category
            </th>
            {months.map((m, i) => (
              <th key={i} className="text-right px-3 py-2 font-semibold whitespace-nowrap min-w-[100px]">
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(({ key, label, bold, separator, variance }, rowIdx) => {
            const values = data[key] || []
            const isEven = rowIdx % 2 === 0

            return (
              <tr
                key={key}
                className={`${separator ? 'border-t-2 border-slate-300' : ''} ${
                  bold ? 'bg-slate-100 font-semibold' : isEven ? 'bg-white' : 'bg-gray-50'
                } hover:bg-blue-50 transition-colors`}
              >
                <td className={`px-4 py-2 sticky left-0 ${bold ? 'bg-slate-100 font-semibold' : isEven ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200`}>
                  {label}
                </td>
                {months.map((_, m) => {
                  const val = values[m]
                  let cellClass = 'px-3 py-2 text-right tabular-nums'
                  if (variance && val != null) {
                    cellClass += val >= 0 ? ' text-green-600' : ' text-red-600'
                  }
                  return (
                    <td key={m} className={cellClass}>
                      {variance && val > 0 ? '+' : ''}
                      {fmt(val)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

import React from 'react'

const fmt = (val, type = 'currency') => {
  if (val == null || val === '') return ''
  if (type === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(val)
  }
  if (type === 'number') return Number(val).toLocaleString()
  return val
}

/**
 * Reusable grid for month × entity data.
 * Props:
 *   columns: [{key, label, type, editable}]
 *   rows: [{id, label, data: {colKey: {monthIdx: value}}}]
 *   months: string[]
 *   onEdit: (rowId, colKey, monthIdx, value) => void
 */
export default function ForecastGrid({ columns, rows, months, onEdit }) {
  if (!rows || !months) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-800 text-white">
            <th className="text-left px-4 py-2 sticky left-0 bg-slate-800 min-w-[160px]">Entity</th>
            <th className="text-left px-3 py-2 min-w-[100px]">Field</th>
            {months.map((m, i) => {
              const d = new Date(m + 'T00:00:00')
              return (
                <th key={i} className="text-right px-3 py-2 whitespace-nowrap min-w-[90px]">
                  {d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) =>
            columns.map((col, colIdx) => (
              <tr
                key={`${row.id}-${col.key}`}
                className={`${rowIdx % 2 === 0 && colIdx === 0 ? 'border-t border-gray-200' : ''} ${
                  colIdx === 0 ? '' : 'bg-gray-50'
                } hover:bg-blue-50`}
              >
                {colIdx === 0 && (
                  <td
                    rowSpan={columns.length}
                    className="px-4 py-2 font-medium sticky left-0 bg-white border-r border-gray-200 align-middle"
                  >
                    {row.label}
                  </td>
                )}
                <td className="px-3 py-1 text-gray-500 text-xs">{col.label}</td>
                {months.map((_, monthIdx) => {
                  const val = row.data?.[col.key]?.[monthIdx]
                  return (
                    <td key={monthIdx} className="px-2 py-1 text-right">
                      {col.editable && onEdit ? (
                        <input
                          type="number"
                          defaultValue={val ?? 0}
                          onBlur={e => {
                            const num = Number(e.target.value)
                            if (!isNaN(num)) onEdit(row.id, col.key, monthIdx, num)
                          }}
                          className="w-full text-right text-sm bg-transparent border border-transparent focus:border-blue-400 focus:bg-blue-50 rounded px-1 outline-none"
                        />
                      ) : (
                        <span className="tabular-nums">{fmt(val, col.type)}</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

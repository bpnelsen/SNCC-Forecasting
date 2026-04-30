import React, { useState } from 'react'
import { updateLoan } from '../api/loans'
import { useVersion } from '../App'

const fmt = (val) => {
  if (val == null) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(val)
}

export default function FlaggedLoanTable({ loans, onUpdate }) {
  const { selectedVersionId } = useVersion()
  const [editValues, setEditValues] = useState({})
  const [saving, setSaving] = useState({})

  if (!loans || loans.length === 0) return null

  const handleSave = async (loan) => {
    const newVal = editValues[loan.id ?? loan.loan_number]
    if (newVal == null) return
    setSaving(prev => ({ ...prev, [loan.id]: true }))
    try {
      await updateLoan(selectedVersionId, loan.id, { monthly_draw_increase: Number(newVal) })
      if (onUpdate) onUpdate(loan.id, Number(newVal))
    } catch (err) {
      console.error('Failed to update loan:', err)
    } finally {
      setSaving(prev => ({ ...prev, [loan.id]: false }))
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-amber-50 border-b border-amber-200">
            <th className="text-left px-4 py-2 text-amber-800 font-semibold">Loan #</th>
            <th className="text-left px-4 py-2 text-amber-800 font-semibold">Borrower</th>
            <th className="text-left px-4 py-2 text-amber-800 font-semibold">Type</th>
            <th className="text-left px-4 py-2 text-amber-800 font-semibold">Flag Reason</th>
            <th className="text-right px-4 py-2 text-amber-800 font-semibold">Monthly Draw</th>
            <th className="text-right px-4 py-2 text-amber-800 font-semibold">Override</th>
          </tr>
        </thead>
        <tbody>
          {loans.map((loan, idx) => {
            const key = loan.id ?? loan.loan_number ?? idx
            return (
              <tr key={key} className="border-b border-amber-100 hover:bg-amber-50">
                <td className="px-4 py-2 font-mono text-xs">{loan.loan_number || '-'}</td>
                <td className="px-4 py-2">{loan.borrower || '-'}</td>
                <td className="px-4 py-2">
                  <span className="bg-blue-100 text-blue-700 text-xs rounded px-2 py-0.5">
                    {loan.loan_type || '-'}
                  </span>
                </td>
                <td className="px-4 py-2 text-red-600 text-xs">{loan.flag_reason || loan.draw_flag_reason}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {fmt(loan.monthly_draw_increase)}
                </td>
                <td className="px-4 py-2">
                  {loan.id ? (
                    <div className="flex items-center gap-2 justify-end">
                      <input
                        type="number"
                        placeholder="Override..."
                        value={editValues[key] ?? ''}
                        onChange={e => setEditValues(prev => ({ ...prev, [key]: e.target.value }))}
                        className="w-24 text-right border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
                      />
                      <button
                        onClick={() => handleSave(loan)}
                        disabled={saving[loan.id] || !editValues[key]}
                        className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded px-2 py-1"
                      >
                        {saving[loan.id] ? '...' : 'Save'}
                      </button>
                    </div>
                  ) : '-'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

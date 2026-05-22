import React, { useState, useEffect } from 'react'
import { useVersion } from '../App'
import { getProfitSharing, updateProfitSharing } from '../api/profitSharing'

const fmt = (val) => {
  if (val == null) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0
  }).format(val)
}

function getNextMonths(n) {
  const months = []
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  for (let i = 0; i < n; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
    months.push(d.toISOString().split('T')[0])
  }
  return months
}

const MONTHS = getNextMonths(12)
const MONTH_LABELS = MONTHS.map(m => {
  const d = new Date(m + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
})

export default function ProfitSharing() {
  const { selectedVersionId } = useVersion()
  const [assumptions, setAssumptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [editData, setEditData] = useState({})

  useEffect(() => {
    if (!selectedVersionId) return
    setLoading(true)
    getProfitSharing(selectedVersionId)
      .then(res => setAssumptions(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedVersionId])

  // Get unique builder/product_type combinations
  const builderTypes = [...new Set(assumptions.map(a => `${a.builder}|||${a.product_type || ''}`))]

  const getCell = (builderKey, monthIso, field) => {
    const [builder, ptype] = builderKey.split('|||')
    const editKey = `${builderKey}-${monthIso}-${field}`
    if (editData[editKey] !== undefined) return editData[editKey]
    const a = assumptions.find(x =>
      x.builder === builder &&
      (x.product_type || '') === ptype &&
      x.forecast_month?.substring(0, 7) === monthIso.substring(0, 7)
    )
    if (field === 'avg_profit_per_unit') {
      // Row-level - use first assumption for builder/type
      const any = assumptions.find(x =>
        x.builder === builder && (x.product_type || '') === ptype
      )
      return any?.avg_profit_per_unit ?? 0
    }
    return a ? (a[field] ?? 0) : 0
  }

  const handleEdit = (builderKey, monthIso, field, value) => {
    const editKey = `${builderKey}-${monthIso}-${field}`
    setEditData(prev => ({ ...prev, [editKey]: value }))
  }

  const handleAvgProfitEdit = (builderKey, value) => {
    // Apply to all months for this builder
    MONTHS.forEach(m => {
      const editKey = `${builderKey}-${m}-avg_profit_per_unit`
      setEditData(prev => ({ ...prev, [editKey]: value }))
    })
  }

  const addBuilderType = () => {
    const builder = prompt('Enter builder name:')
    if (!builder) return
    const ptype = prompt('Enter product type (e.g. SFR, MF):') || ''
    const key = `${builder}|||${ptype}`
    if (builderTypes.includes(key)) return
    // Will be created on save
    const newAssumptions = MONTHS.map(m => ({
      builder,
      product_type: ptype || null,
      avg_profit_per_unit: 0,
      forecast_month: m,
      closings_count: 0
    }))
    setAssumptions(prev => [...prev, ...newAssumptions])
  }

  const handleSave = async () => {
    if (!selectedVersionId) return
    setSaving(true)
    try {
      // Build full list from current state + edits
      const data = []
      builderTypes.forEach(builderKey => {
        const [builder, ptype] = builderKey.split('|||')
        MONTHS.forEach(m => {
          const avgProfit = parseFloat(getCell(builderKey, m, 'avg_profit_per_unit')) || 0
          const closings = parseInt(getCell(builderKey, m, 'closings_count')) || 0
          data.push({
            builder,
            product_type: ptype || null,
            avg_profit_per_unit: avgProfit,
            forecast_month: m,
            closings_count: closings
          })
        })
      })
      const res = await updateProfitSharing(selectedVersionId, data)
      setAssumptions(res.data)
      setEditData({})
      setMessage({ type: 'success', text: 'Profit sharing assumptions saved.' })
    } catch (err) {
      setMessage({ type: 'error', text: 'Save failed: ' + (err.response?.data?.detail || err.message) })
    } finally {
      setSaving(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  // Monthly income totals
  const monthlyIncome = MONTHS.map((m, mIdx) => {
    return builderTypes.reduce((sum, builderKey) => {
      const closings = parseFloat(getCell(builderKey, m, 'closings_count')) || 0
      const avgProfit = parseFloat(getCell(builderKey, m, 'avg_profit_per_unit')) || 0
      return sum + closings * avgProfit
    }, 0)
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Profit Sharing</h1>
        <div className="flex gap-2">
          <button onClick={addBuilderType} className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
            + Add Builder
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium"
          >
            {saving ? 'Saving...' : 'Save All'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`rounded-lg p-3 text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 sticky left-0 bg-gray-100 min-w-[140px]">Builder</th>
                  <th className="text-left px-3 py-3 font-semibold text-gray-600 min-w-[80px]">Type</th>
                  <th className="text-left px-3 py-3 font-semibold text-gray-600 min-w-[80px]">Field</th>
                  <th className="text-right px-3 py-3 font-semibold text-gray-600 min-w-[100px]">Avg Profit/Unit</th>
                  {MONTH_LABELS.map((m, i) => (
                    <th key={i} className="text-right px-3 py-3 font-semibold text-gray-600 whitespace-nowrap min-w-[80px]">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {builderTypes.length === 0 ? (
                  <tr>
                    <td colSpan={4 + MONTHS.length} className="text-center py-8 text-gray-400">
                      No builders. Click "+ Add Builder" to get started.
                    </td>
                  </tr>
                ) : (
                  <>
                    {builderTypes.map((builderKey, idx) => {
                      const [builder, ptype] = builderKey.split('|||')
                      const avgProfit = parseFloat(editData[`${builderKey}-avg_profit`] ??
                        getCell(builderKey, MONTHS[0], 'avg_profit_per_unit')) || 0

                      return (
                        <React.Fragment key={builderKey}>
                          {/* Closings row */}
                          <tr className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                            <td rowSpan={2} className="px-4 py-2 font-medium sticky left-0 bg-inherit border-r border-gray-200 align-middle">
                              {builder}
                            </td>
                            <td rowSpan={2} className="px-3 py-2 text-gray-500 border-r border-gray-200 align-middle">
                              {ptype || '-'}
                            </td>
                            <td className="px-3 py-1.5 text-gray-500">Closings</td>
                            <td className="px-3 py-1.5 text-right">
                              <input
                                type="number"
                                min="0"
                                step="1000"
                                value={editData[`${builderKey}-avg_profit`] ?? getCell(builderKey, MONTHS[0], 'avg_profit_per_unit')}
                                onChange={e => {
                                  setEditData(prev => ({ ...prev, [`${builderKey}-avg_profit`]: e.target.value }))
                                  handleAvgProfitEdit(builderKey, e.target.value)
                                }}
                                className="w-full text-right text-xs border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:border-blue-400"
                              />
                            </td>
                            {MONTHS.map((m, mIdx) => (
                              <td key={mIdx} className="px-2 py-1">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={getCell(builderKey, m, 'closings_count')}
                                  onChange={e => handleEdit(builderKey, m, 'closings_count', e.target.value)}
                                  className="w-full text-right text-xs border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:border-blue-400"
                                />
                              </td>
                            ))}
                          </tr>
                          {/* Income row */}
                          <tr className={`border-b border-gray-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                            <td className="px-3 py-1 text-gray-400 text-xs italic">Income</td>
                            <td className="px-3 py-1"></td>
                            {MONTHS.map((m, mIdx) => {
                              const closings = parseFloat(getCell(builderKey, m, 'closings_count')) || 0
                              const profit = parseFloat(getCell(builderKey, m, 'avg_profit_per_unit')) || 0
                              return (
                                <td key={mIdx} className="px-3 py-1 text-right tabular-nums text-green-600 font-medium">
                                  {fmt(closings * profit)}
                                </td>
                              )
                            })}
                          </tr>
                        </React.Fragment>
                      )
                    })}

                    {/* Total Income row */}
                    <tr className="bg-slate-800 text-white font-semibold">
                      <td className="px-4 py-2.5 sticky left-0 bg-slate-800">Total Income</td>
                      <td className="px-3 py-2.5"></td>
                      <td className="px-3 py-2.5"></td>
                      <td className="px-3 py-2.5"></td>
                      {monthlyIncome.map((val, i) => (
                        <td key={i} className="px-3 py-2.5 text-right tabular-nums text-green-300">
                          {fmt(val)}
                        </td>
                      ))}
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

import React, { useState, useEffect, useCallback } from 'react'
import { useVersion } from '../App'
import { getNHC, updateNHC, getDrawCurves, updateDrawCurves } from '../api/nhc'

const DEFAULT_CURVE = [0.05, 0.10, 0.15, 0.15, 0.15, 0.10, 0.10, 0.08, 0.05, 0.04, 0.03]
const NUM_MONTHS = 12

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

const MONTH_LABELS = getNextMonths(NUM_MONTHS).map(m => {
  const d = new Date(m + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
})

export default function NHC() {
  const { selectedVersionId } = useVersion()
  const [assumptions, setAssumptions] = useState([])
  const [drawCurves, setDrawCurves] = useState({ SF: [...DEFAULT_CURVE], MF: [...DEFAULT_CURVE] })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [curveSaving, setCurveSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const months = getNextMonths(NUM_MONTHS)

  useEffect(() => {
    if (!selectedVersionId) return
    setLoading(true)
    Promise.all([getNHC(selectedVersionId), getDrawCurves(selectedVersionId)])
      .then(([nhcRes, curveRes]) => {
        setAssumptions(nhcRes.data)
        const curves = { SF: [...DEFAULT_CURVE], MF: [...DEFAULT_CURVE] }
        for (const c of curveRes.data) {
          curves[c.product_type] = c.curve_values
        }
        setDrawCurves(curves)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedVersionId])

  // Build grid: rows=developments, columns=months
  const developments = [...new Set(assumptions.map(a => `${a.development_name}|||${a.builder || ''}`))]

  const getCell = useCallback((devKey, monthIso, field) => {
    const [devName, builder] = devKey.split('|||')
    const a = assumptions.find(x =>
      x.development_name === devName &&
      (x.builder || '') === builder &&
      x.forecast_month?.substring(0, 7) === monthIso.substring(0, 7)
    )
    return a ? (a[field] ?? 0) : 0
  }, [assumptions])

  const handleCellChange = (devKey, monthIso, field, value) => {
    const [devName, builder] = devKey.split('|||')
    const numVal = typeof value === 'number' ? value : Number(value)
    setAssumptions(prev => {
      const existing = prev.find(x =>
        x.development_name === devName &&
        (x.builder || '') === builder &&
        x.forecast_month?.substring(0, 7) === monthIso.substring(0, 7)
      )
      if (existing) {
        return prev.map(x => x === existing ? { ...x, [field]: numVal } : x)
      } else {
        return [...prev, {
          development_name: devName,
          builder: builder || null,
          forecast_month: monthIso,
          [field]: numVal,
          sf_starts: 0, mf_starts: 0,
          sf_loan_amount: 0, mf_loan_amount: 0,
          sf_payoffs: 0, mf_payoffs: 0,
          memorial_amount: 0,
          sf_interest_rate: 0.085,
          mf_interest_rate: 0.085,
        }]
      }
    })
  }

  const addDevelopment = () => {
    const devName = prompt('Enter development name:')
    if (!devName) return
    const builder = prompt('Enter builder name (optional):') || ''
    const key = `${devName}|||${builder}`
    if (developments.includes(key)) return
    const newAssumptions = months.map(m => ({
      development_name: devName,
      builder: builder || null,
      forecast_month: m,
      sf_starts: 0, mf_starts: 0,
      sf_loan_amount: 0, mf_loan_amount: 0,
      sf_payoffs: 0, mf_payoffs: 0,
      memorial_amount: 0,
      sf_interest_rate: 0.085,
      mf_interest_rate: 0.085,
    }))
    setAssumptions(prev => [...prev, ...newAssumptions])
  }

  const handleSave = async () => {
    if (!selectedVersionId) return
    setSaving(true)
    try {
      await updateNHC(selectedVersionId, assumptions)
      setMessage({ type: 'success', text: 'NHC assumptions saved.' })
    } catch (err) {
      setMessage({ type: 'error', text: 'Save failed: ' + (err.response?.data?.detail || err.message) })
    } finally {
      setSaving(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const handleCurveSave = async (type) => {
    if (!selectedVersionId) return
    setCurveSaving(true)
    try {
      await updateDrawCurves(selectedVersionId, { product_type: type, curve_values: drawCurves[type] })
      setMessage({ type: 'success', text: `${type} draw curve saved.` })
    } catch (err) {
      setMessage({ type: 'error', text: 'Curve save failed.' })
    } finally {
      setCurveSaving(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const handleCurveChange = (type, idx, val) => {
    setDrawCurves(prev => {
      const newCurves = { ...prev }
      newCurves[type] = [...(prev[type] || DEFAULT_CURVE)]
      newCurves[type][idx] = parseFloat(val) || 0
      return newCurves
    })
  }

  const FIELDS = [
    { key: 'sf_starts', label: 'SF Starts', type: 'number', step: '1', defaultVal: 0 },
    { key: 'mf_starts', label: 'MF Starts', type: 'number', step: '1', defaultVal: 0 },
    { key: 'sf_loan_amount', label: 'SF Loan Amt ($)', type: 'currency', step: '1000', defaultVal: 0 },
    { key: 'mf_loan_amount', label: 'MF Loan Amt ($)', type: 'currency', step: '1000', defaultVal: 0 },
    { key: 'sf_payoffs', label: 'SF Payoffs', type: 'number', step: '1', defaultVal: 0 },
    { key: 'mf_payoffs', label: 'MF Payoffs', type: 'number', step: '1', defaultVal: 0 },
    { key: 'sf_interest_rate', label: 'SF Rate (%)', type: 'percent', step: '0.001', defaultVal: 0.085 },
    { key: 'mf_interest_rate', label: 'MF Rate (%)', type: 'percent', step: '0.001', defaultVal: 0.085 },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">NHC Forecast</h1>
        <div className="flex gap-2">
          <button onClick={addDevelopment} className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
            + Add Development
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

      {/* Draw Curves */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Draw Curves (11 months)</h2>
        {['SF', 'MF'].map(type => (
          <div key={type} className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">{type} Draw Curve</span>
              <button
                onClick={() => handleCurveSave(type)}
                disabled={curveSaving}
                className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save {type}
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {(drawCurves[type] || DEFAULT_CURVE).map((val, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1">
                  <span className="text-xs text-gray-400">M{idx + 1}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={val}
                    onChange={e => handleCurveChange(type, idx, e.target.value)}
                    className="w-16 text-center text-sm border border-gray-300 rounded px-1 py-1 focus:outline-none focus:border-blue-400"
                  />
                  <span className="text-xs text-gray-400">{(val * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Assumptions Grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Development Assumptions</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-200">
                  <th className="text-left px-4 py-2 font-semibold text-gray-600 sticky left-0 bg-gray-100 min-w-[160px]">Development</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600 min-w-[80px]">Builder</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600 min-w-[80px]">Field</th>
                  {MONTH_LABELS.map((m, i) => (
                    <th key={i} className="text-right px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[80px]">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {developments.length === 0 ? (
                  <tr>
                    <td colSpan={3 + NUM_MONTHS} className="text-center py-8 text-gray-400">
                      No developments. Click "+ Add Development" to get started.
                    </td>
                  </tr>
                ) : (
                  developments.map((devKey, devIdx) => {
                    const [devName, builder] = devKey.split('|||')
                    return FIELDS.map((field, fIdx) => (
                      <tr
                        key={`${devKey}-${field.key}`}
                        className={`border-b border-gray-100 ${devIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                      >
                        {fIdx === 0 && (
                          <>
                            <td rowSpan={FIELDS.length} className="px-4 py-2 font-medium sticky left-0 bg-inherit border-r border-gray-200 align-middle">
                              {devName}
                            </td>
                            <td rowSpan={FIELDS.length} className="px-4 py-2 text-gray-500 border-r border-gray-200 align-middle">
                              {builder || '-'}
                            </td>
                          </>
                        )}
                        <td className="px-3 py-1 text-gray-500 min-w-[100px]">{field.label}</td>
                        {months.map((m, mIdx) => {
                          const raw = getCell(devKey, m, field.key)
                          const val = field.type === 'percent'
                            ? (raw != null ? (raw * 100).toFixed(3) : (field.defaultVal * 100).toFixed(3))
                            : (raw ?? field.defaultVal ?? 0)
                          return (
                            <td key={mIdx} className="px-2 py-1">
                              <div className="relative flex items-center">
                                <input
                                  type="number"
                                  min="0"
                                  step={field.step || '1'}
                                  defaultValue={val}
                                  onBlur={e => {
                                    const v = field.type === 'percent'
                                      ? parseFloat(e.target.value) / 100
                                      : Number(e.target.value)
                                    handleCellChange(devKey, m, field.key, v)
                                  }}
                                  className={`w-full text-right text-xs bg-transparent border border-transparent focus:border-blue-400 focus:bg-blue-50 rounded px-1 outline-none ${field.type === 'percent' ? 'pr-4' : ''}`}
                                />
                                {field.type === 'percent' && (
                                  <span className="absolute right-1 text-xs text-gray-400 pointer-events-none">%</span>
                                )}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Totals */}
      {assumptions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Monthly Totals</h2>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left px-3 py-2">Type</th>
                  {MONTH_LABELS.map((m, i) => (
                    <th key={i} className="text-right px-3 py-2 whitespace-nowrap">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {['sf_starts', 'mf_starts', 'sf_payoffs', 'mf_payoffs'].map(field => (
                  <tr key={field} className="border-b border-gray-100">
                    <td className="px-3 py-1.5 font-medium text-gray-700 capitalize">{field.replace('_', ' ')}</td>
                    {months.map((m, mIdx) => {
                      const total = assumptions
                        .filter(a => a.forecast_month?.substring(0, 7) === m.substring(0, 7))
                        .reduce((sum, a) => sum + (a[field] || 0), 0)
                      return <td key={mIdx} className="px-3 py-1.5 text-right tabular-nums">{total}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

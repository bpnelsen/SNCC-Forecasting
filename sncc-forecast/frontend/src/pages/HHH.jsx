import React, { useState, useEffect } from 'react'
import { useVersion } from '../App'
import { getHHH, updateHHH } from '../api/hhh'

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

function computeProjection(inv, numMonths) {
  if (!inv) return new Array(numMonths).fill(0)
  const months = getNextMonths(numMonths)
  const isDecreasing = (inv.investment_name || '').toUpperCase().includes('TOM')
  const maturity = inv.maturity_date ? new Date(inv.maturity_date + 'T00:00:00') : null

  let balance = inv.current_balance || 0
  return months.map((m, i) => {
    const monthDate = new Date(m + 'T00:00:00')
    const pastMaturity = maturity ? monthDate > maturity : false
    if (pastMaturity) return 0
    if (i === 0) return balance
    balance = isDecreasing
      ? Math.max(balance - (inv.monthly_deduction || 0), 0)
      : balance + (inv.monthly_increase || 0)
    return balance
  })
}

function InvestmentCard({ investment, onSave }) {
  const [form, setForm] = useState({ ...investment })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const projections = computeProjection(form, 12)
  const isDecreasing = (investment.investment_name || '').toUpperCase().includes('TOM')

  const handleChange = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(investment.id, form)
      setMessage({ type: 'success', text: 'Saved!' })
    } catch (err) {
      setMessage({ type: 'error', text: 'Save failed' })
    } finally {
      setSaving(false)
      setTimeout(() => setMessage(null), 2000)
    }
  }

  const FIELDS = [
    { key: 'current_balance', label: 'Current Balance', type: 'number', step: '1000' },
    { key: 'loan_amount', label: 'Loan Amount', type: 'number', step: '1000' },
    isDecreasing
      ? { key: 'monthly_deduction', label: 'Monthly Deduction', type: 'number', step: '1000' }
      : { key: 'monthly_increase', label: 'Monthly Increase', type: 'number', step: '1000' },
    { key: 'release_price', label: 'Release Price', type: 'number', step: '1000' },
    { key: 'units_per_month', label: 'Units/Month', type: 'number', step: '1' },
    { key: 'maturity_date', label: 'Maturity Date', type: 'date' },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className={`px-5 py-4 border-b border-gray-100 ${isDecreasing ? 'bg-red-50' : 'bg-green-50'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">{investment.investment_name}</h3>
            <p className={`text-sm font-medium mt-0.5 ${isDecreasing ? 'text-red-600' : 'text-green-600'}`}>
              {isDecreasing ? 'Decreasing (Monthly Deduction)' : 'Increasing (Monthly Draw)'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Current Balance</p>
            <p className="text-xl font-bold text-gray-900">{fmt(form.current_balance)}</p>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          {FIELDS.map(field => (
            <div key={field.key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
              <input
                type={field.type}
                step={field.step}
                value={form[field.key] ?? ''}
                onChange={e => handleChange(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {message && (
            <span className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {message.text}
            </span>
          )}
        </div>
      </div>

      {/* Mini projection */}
      <div className="px-5 pb-5">
        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">12-Month Projection</p>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr>
                {MONTH_LABELS.map((m, i) => (
                  <th key={i} className="text-right px-2 py-1 text-gray-400 font-medium whitespace-nowrap">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {projections.map((val, i) => (
                  <td key={i} className={`px-2 py-1 text-right tabular-nums font-medium ${isDecreasing ? 'text-red-600' : 'text-green-600'}`}>
                    {fmt(val)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function HHH() {
  const { selectedVersionId } = useVersion()
  const [investments, setInvestments] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedVersionId) return
    setLoading(true)
    getHHH(selectedVersionId)
      .then(res => setInvestments(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedVersionId])

  const handleSave = async (id, data) => {
    const { investment_name, id: _, version_id, ...updateData } = data
    const res = await updateHHH(selectedVersionId, id, updateData)
    setInvestments(prev => prev.map(inv => inv.id === id ? res.data : inv))
  }

  // Aggregate projection totals
  const totals = MONTHS.map((_, mIdx) => {
    return investments.reduce((sum, inv) => {
      const proj = computeProjection(inv, 12)
      return sum + (proj[mIdx] || 0)
    }, 0)
  })

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">HHH Investments</h1>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : investments.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-400">No investments found. Import an HHH file to populate data.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6">
            {investments.map(inv => (
              <InvestmentCard key={inv.id} investment={inv} onSave={handleSave} />
            ))}
          </div>

          {/* Combined totals */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-3">Combined Total - 12 Month Projection</h2>
            <div className="overflow-x-auto">
              <table className="text-sm w-full">
                <thead>
                  <tr className="bg-gray-100">
                    {MONTH_LABELS.map((m, i) => (
                      <th key={i} className="text-right px-3 py-2 font-semibold text-gray-600 whitespace-nowrap">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {totals.map((val, i) => (
                      <td key={i} className="px-3 py-2 text-right tabular-nums font-bold text-blue-600">
                        {fmt(val)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

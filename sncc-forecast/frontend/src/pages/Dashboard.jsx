import React, { useState, useEffect } from 'react'
import { useVersion } from '../App'
import { getSummary } from '../api/versions'
import SummaryTable from '../components/SummaryTable'
import ExportButton from '../components/ExportButton'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const fmt = (val) => {
  if (val == null) return '$0'
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(1)}B`
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(1)}M`
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)
}

export default function Dashboard() {
  const { selectedVersionId, versions } = useVersion()
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [compareMode, setCompareMode] = useState(false)
  const [compareVersionId, setCompareVersionId] = useState(null)
  const [compareSummary, setCompareSummary] = useState(null)

  useEffect(() => {
    if (!selectedVersionId) return
    setLoading(true)
    getSummary(selectedVersionId)
      .then(res => setSummary(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedVersionId])

  useEffect(() => {
    if (!compareVersionId || !compareMode) {
      setCompareSummary(null)
      return
    }
    getSummary(compareVersionId)
      .then(res => setCompareSummary(res.data))
      .catch(console.error)
  }, [compareVersionId, compareMode])

  const chartData = summary?.months?.map((m, i) => {
    const d = new Date(m + 'T00:00:00')
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    const point = {
      month: label,
      'Total ALL': summary.total_all?.[i] || 0,
      'Total Loans': summary.total_loans?.[i] || 0,
      'Land Bucket': summary.land_bucket?.[i] || 0,
    }
    if (compareSummary) {
      point['Compare Total ALL'] = compareSummary.total_all?.[i] || 0
    }
    return point
  }) || []

  const currentVersion = versions.find(v => v.id === selectedVersionId)

  // Stats
  const latestTotal = summary?.total_all?.[summary.total_all.length - 1]
  const firstTotal = summary?.total_all?.[0]
  const trend = latestTotal && firstTotal ? latestTotal - firstTotal : null

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          {currentVersion && (
            <p className="text-sm text-gray-500 mt-1">
              Version: <span className="font-medium">{currentVersion.label}</span>
              {currentVersion.snapshot_date && (
                <span className="ml-2">· {new Date(currentVersion.snapshot_date).toLocaleDateString()}</span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCompareMode(!compareMode)}
            className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
              compareMode
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'
            }`}
          >
            {compareMode ? 'Exit Compare' : 'Compare Versions'}
          </button>
          <ExportButton />
        </div>
      </div>

      {/* Compare version picker */}
      {compareMode && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 flex items-center gap-4">
          <span className="text-sm font-medium text-purple-700">Compare with:</span>
          <select
            value={compareVersionId || ''}
            onChange={e => setCompareVersionId(Number(e.target.value))}
            className="border border-purple-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500 bg-white"
          >
            <option value="">Select version...</option>
            {versions.filter(v => v.id !== selectedVersionId).map(v => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Current Total (Month 1)', value: fmt(summary.total_all?.[0]), color: 'blue' },
            { label: 'End of Period (Month 12)', value: fmt(summary.total_all?.[11]), color: 'green' },
            { label: 'Total Loans (Month 1)', value: fmt(summary.total_loans?.[0]), color: 'purple' },
            { label: '12-Month Trend', value: trend != null ? fmt(trend) : '-', color: trend >= 0 ? 'green' : 'red', prefix: trend > 0 ? '+' : '' },
          ].map(({ label, value, color, prefix }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
              <p className={`text-xl font-bold mt-1 text-${color}-600`}>{prefix}{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Chart */}
      {!loading && summary && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Portfolio Balance Forecast (12 Months)</h2>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} width={80} />
              <Tooltip formatter={(val) => fmt(val)} />
              <Legend />
              <Line type="monotone" dataKey="Total ALL" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Total Loans" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Land Bucket" stroke="#f59e0b" strokeWidth={2} dot={false} />
              {compareSummary && (
                <Line type="monotone" dataKey="Compare Total ALL" stroke="#a855f7" strokeWidth={2} dot={false} strokeDasharray="5 5" />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary Table */}
      {!loading && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800">Summary - 12 Month Forecast</h2>
          </div>
          <SummaryTable data={summary} />
        </div>
      )}

      {/* Compare table */}
      {compareMode && compareSummary && (
        <div className="bg-white rounded-xl border border-purple-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-purple-100 bg-purple-50">
            <h2 className="text-base font-semibold text-purple-800">
              Compare: {versions.find(v => v.id === compareVersionId)?.label}
            </h2>
          </div>
          <SummaryTable data={compareSummary} />
        </div>
      )}

      {!loading && !summary && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-lg">No data available</p>
          <p className="text-gray-400 text-sm mt-1">Import a Current Report to get started</p>
        </div>
      )}
    </div>
  )
}

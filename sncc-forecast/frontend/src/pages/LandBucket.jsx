import React, { useState, useEffect } from 'react'
import { useVersion } from '../App'
import { getLandBucket, updateLBMonthly } from '../api/landBucket'

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

export default function LandBucket() {
  const { selectedVersionId } = useVersion()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(false)
  const [expandedProjects, setExpandedProjects] = useState(new Set())
  const [editData, setEditData] = useState({})
  const [saving, setSaving] = useState({})
  const [message, setMessage] = useState(null)

  useEffect(() => {
    if (!selectedVersionId) return
    setLoading(true)
    getLandBucket(selectedVersionId)
      .then(res => setProjects(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedVersionId])

  const toggleProject = (id) => {
    setExpandedProjects(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const getMonthlyVal = (project, monthIso, field) => {
    // Check edit data first
    const editKey = `${project.id}-${monthIso}-${field}`
    if (editData[editKey] !== undefined) return editData[editKey]
    // Then from assumptions
    const ma = project.monthly_assumptions?.find(a =>
      a.forecast_month?.substring(0, 7) === monthIso.substring(0, 7)
    )
    return ma ? (ma[field] ?? 0) : 0
  }

  const handleEdit = (projectId, monthIso, field, value) => {
    const editKey = `${projectId}-${monthIso}-${field}`
    setEditData(prev => ({ ...prev, [editKey]: value }))
  }

  const handleSaveProject = async (project) => {
    setSaving(prev => ({ ...prev, [project.id]: true }))
    try {
      const monthlyData = MONTHS.map(m => {
        const existing = project.monthly_assumptions?.find(a =>
          a.forecast_month?.substring(0, 7) === m.substring(0, 7)
        )
        return {
          forecast_month: m,
          dev_cost_increase: parseFloat(editData[`${project.id}-${m}-dev_cost_increase`] ?? existing?.dev_cost_increase ?? 0),
          lot_paydown_amount: parseFloat(editData[`${project.id}-${m}-lot_paydown_amount`] ?? existing?.lot_paydown_amount ?? 0),
          lots_released: parseInt(editData[`${project.id}-${m}-lots_released`] ?? existing?.lots_released ?? 0),
        }
      })
      const res = await updateLBMonthly(selectedVersionId, project.id, monthlyData)
      // Update local state
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, monthly_assumptions: res.data } : p))
      // Clear edit data for this project
      setEditData(prev => {
        const next = { ...prev }
        MONTHS.forEach(m => {
          delete next[`${project.id}-${m}-dev_cost_increase`]
          delete next[`${project.id}-${m}-lot_paydown_amount`]
          delete next[`${project.id}-${m}-lots_released`]
        })
        return next
      })
      setMessage({ type: 'success', text: `Saved ${project.project_name || project.dept_code}` })
    } catch (err) {
      setMessage({ type: 'error', text: 'Save failed: ' + (err.response?.data?.detail || err.message) })
    } finally {
      setSaving(prev => ({ ...prev, [project.id]: false }))
      setTimeout(() => setMessage(null), 3000)
    }
  }

  // Builder rollup
  const builderTotals = {}
  for (const proj of projects) {
    const builder = proj.builder || 'Unknown'
    if (!builderTotals[builder]) builderTotals[builder] = { balance: 0, count: 0 }
    builderTotals[builder].balance += proj.current_balance || 0
    builderTotals[builder].count++
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Land Bucket</h1>

      {message && (
        <div className={`rounded-lg p-3 text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {/* Builder Rollup */}
      {Object.keys(builderTotals).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-3">Builder Rollup</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(builderTotals).map(([builder, data]) => (
              <div key={builder} className="border border-gray-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase">{builder}</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{fmt(data.balance)}</p>
                <p className="text-xs text-gray-400">{data.count} project{data.count !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">Projects ({projects.length})</h2>
          </div>

          {projects.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              No projects. Import a Land Bucket file to populate data.
            </div>
          ) : (
            <div>
              {/* Summary table */}
              <table className="w-full text-sm border-b border-gray-200">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left px-4 py-2 font-semibold text-gray-600 text-xs">Dept Code</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-600 text-xs">Builder</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-600 text-xs">Project</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-600 text-xs">Phase</th>
                    <th className="text-right px-4 py-2 font-semibold text-gray-600 text-xs">Lots</th>
                    <th className="text-right px-4 py-2 font-semibold text-gray-600 text-xs">Current Balance</th>
                    <th className="text-right px-4 py-2 font-semibold text-gray-600 text-xs">Total Budget</th>
                    <th className="text-right px-4 py-2 font-semibold text-gray-600 text-xs">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map(proj => (
                    <React.Fragment key={proj.id}>
                      <tr
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleProject(proj.id)}
                      >
                        <td className="px-4 py-2.5 font-mono text-xs">{proj.dept_code}</td>
                        <td className="px-4 py-2.5">{proj.builder}</td>
                        <td className="px-4 py-2.5 max-w-[180px] truncate">{proj.project_name}</td>
                        <td className="px-4 py-2.5 text-gray-500">{proj.phase}</td>
                        <td className="px-4 py-2.5 text-right">{proj.total_lots}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmt(proj.current_balance)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmt(proj.total_budget)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="text-blue-500 text-xs">
                            {expandedProjects.has(proj.id) ? '▾ Close' : '▸ Edit'}
                          </span>
                        </td>
                      </tr>
                      {expandedProjects.has(proj.id) && (
                        <tr>
                          <td colSpan={8} className="bg-blue-50 px-4 py-4">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-sm font-semibold text-gray-700">
                                Monthly Assumptions - {proj.project_name}
                              </p>
                              <button
                                onClick={() => handleSaveProject(proj)}
                                disabled={saving[proj.id]}
                                className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                              >
                                {saving[proj.id] ? 'Saving...' : 'Save Changes'}
                              </button>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="text-xs bg-white rounded border border-gray-200">
                                <thead>
                                  <tr className="bg-gray-100">
                                    <th className="text-left px-3 py-2 min-w-[140px]">Field</th>
                                    {MONTH_LABELS.map((m, i) => (
                                      <th key={i} className="text-right px-3 py-2 whitespace-nowrap min-w-[90px]">{m}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {[
                                    { key: 'dev_cost_increase', label: 'Dev Cost Increase ($)' },
                                    { key: 'lot_paydown_amount', label: 'Lot Paydown ($)' },
                                    { key: 'lots_released', label: 'Lots Released (#)' },
                                  ].map(field => (
                                    <tr key={field.key} className="border-t border-gray-100">
                                      <td className="px-3 py-1.5 font-medium text-gray-600">{field.label}</td>
                                      {MONTHS.map((m, mIdx) => (
                                        <td key={mIdx} className="px-2 py-1">
                                          <input
                                            type="number"
                                            min="0"
                                            step={field.key === 'lots_released' ? '1' : '1000'}
                                            value={getMonthlyVal(proj, m, field.key)}
                                            onChange={e => handleEdit(proj.id, m, field.key, e.target.value)}
                                            className="w-full text-right text-xs border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:border-blue-400"
                                          />
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

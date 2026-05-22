import React, { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useVersion } from '../App'
import { getLoans, updateLoan, getLoanProjections } from '../api/loans'

const LOAN_TYPE_LABELS = {
  SFR: 'Single Family Residential',
  MF: 'Multifamily',
  AD: 'A&D (Multiple Lots)',
  RawLand: 'Raw Land',
  FinishedLots: 'Finished Lots',
}

const fmt = (val) => {
  if (val == null) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0
  }).format(val)
}

const fmtRate = (val) => {
  if (val == null) return '-'
  return `${(val * 100).toFixed(2)}%`
}

function ProjectionRow({ versionId, loan }) {
  const [projections, setProjections] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    getLoanProjections(versionId, loan.id, 24)
      .then(res => setProjections(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [versionId, loan.id])

  if (loading) return (
    <tr><td colSpan={9} className="px-4 py-3 text-center text-gray-400 text-sm bg-blue-50">Loading projections...</td></tr>
  )

  if (!projections?.balances?.length) return null

  return (
    <tr>
      <td colSpan={9} className="bg-blue-50 px-4 py-3">
        <p className="text-xs font-semibold text-gray-600 mb-2">Monthly Balance Projection (24 months)</p>
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr>
                {projections.months.map((m, i) => {
                  const d = new Date(m + 'T00:00:00')
                  return (
                    <th key={i} className="px-2 py-1 text-right text-gray-500 font-medium whitespace-nowrap">
                      {d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                {projections.balances.map((b, i) => (
                  <td key={i} className="px-2 py-1 text-right tabular-nums text-gray-700">
                    {fmt(b)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  )
}

export default function Loans() {
  const { type } = useParams()
  const { selectedVersionId } = useVersion()
  const [loans, setLoans] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [filterFlagged, setFilterFlagged] = useState(false)
  const [expandedRows, setExpandedRows] = useState(new Set())
  const [editingDraw, setEditingDraw] = useState({})
  const [savingDraw, setSavingDraw] = useState({})

  const pageSize = 50

  const fetchLoans = useCallback(() => {
    if (!selectedVersionId) return
    setLoading(true)
    const params = { type, page, page_size: pageSize }
    if (filterFlagged) params.flagged = true
    getLoans(selectedVersionId, params)
      .then(res => {
        setLoans(res.data.items)
        setTotal(res.data.total)
        setTotalPages(res.data.total_pages)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedVersionId, type, page, filterFlagged])

  useEffect(() => {
    setPage(1)
    setExpandedRows(new Set())
  }, [selectedVersionId, type])

  useEffect(() => {
    fetchLoans()
  }, [fetchLoans])

  const toggleRow = (id) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDrawSave = async (loan) => {
    const val = editingDraw[loan.id]
    if (val == null) return
    setSavingDraw(prev => ({ ...prev, [loan.id]: true }))
    try {
      await updateLoan(selectedVersionId, loan.id, { monthly_draw_increase: Number(val) })
      setLoans(prev => prev.map(l => l.id === loan.id ? { ...l, monthly_draw_increase: Number(val) } : l))
      setEditingDraw(prev => { const n = { ...prev }; delete n[loan.id]; return n })
    } catch (err) {
      console.error('Save failed', err)
    } finally {
      setSavingDraw(prev => ({ ...prev, [loan.id]: false }))
    }
  }

  const label = LOAN_TYPE_LABELS[type] || type

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{label}</h1>
          <p className="text-sm text-gray-500 mt-1">{total} loans</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={filterFlagged}
              onChange={e => { setFilterFlagged(e.target.checked); setPage(1) }}
              className="rounded"
            />
            Show flagged only
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase">Loan #</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase">Borrower</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase">Development</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase">Balance</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase">Remaining</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase">Rate</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase">Maturity</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase">Monthly Draw</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase">Flag</th>
                </tr>
              </thead>
              <tbody>
                {loans.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-gray-400">
                      No loans found. Import a Current Report to populate data.
                    </td>
                  </tr>
                ) : (
                  loans.map(loan => (
                    <React.Fragment key={loan.id}>
                      <tr
                        className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                          loan.draw_flagged ? 'bg-amber-50' : ''
                        }`}
                        onClick={() => toggleRow(loan.id)}
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-blue-600">
                          {loan.loan_number || '-'}
                        </td>
                        <td className="px-4 py-2.5 max-w-[160px] truncate">{loan.borrower || '-'}</td>
                        <td className="px-4 py-2.5 text-gray-500 max-w-[140px] truncate">{loan.development_name || '-'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmt(loan.current_balance)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmt(loan.loan_remaining)}</td>
                        <td className="px-4 py-2.5 text-right">{fmtRate(loan.interest_rate)}</td>
                        <td className="px-4 py-2.5 text-right text-xs">
                          {loan.maturity_date ? new Date(loan.maturity_date + 'T00:00:00').toLocaleDateString() : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                          {loan.draw_flagged ? (
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                value={editingDraw[loan.id] ?? loan.monthly_draw_increase ?? ''}
                                onChange={e => setEditingDraw(prev => ({ ...prev, [loan.id]: e.target.value }))}
                                className="w-24 text-right text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:border-blue-400"
                              />
                              {editingDraw[loan.id] != null && (
                                <button
                                  onClick={() => handleDrawSave(loan)}
                                  disabled={savingDraw[loan.id]}
                                  className="text-xs bg-blue-600 text-white rounded px-1.5 py-1"
                                >
                                  {savingDraw[loan.id] ? '...' : 'Save'}
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="tabular-nums">{fmt(loan.monthly_draw_increase)}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {loan.draw_flagged ? (
                            <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs rounded px-2 py-0.5">
                              ⚑ {loan.draw_flag_reason?.split(';')[0] || 'Flagged'}
                            </span>
                          ) : (
                            <span className="text-green-500 text-xs">✓</span>
                          )}
                        </td>
                      </tr>
                      {expandedRows.has(loan.id) && (
                        <ProjectionRow versionId={selectedVersionId} loan={loan} />
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                Page {page} of {totalPages} · {total} total loans
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

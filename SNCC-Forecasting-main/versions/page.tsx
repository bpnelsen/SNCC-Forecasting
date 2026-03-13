'use client'

import { useEffect, useState } from 'react'
import { CurrentReportVersion } from '@/lib/types'
import { History, CheckCircle, RotateCcw, AlertCircle } from 'lucide-react'

export default function VersionsPage() {
  const [versions, setVersions] = useState<CurrentReportVersion[]>([])
  const [loading, setLoading]   = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/versions')
      .then(r => r.json()).then(setVersions).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const restore = async (id: string, label: string) => {
    setRestoring(id); setMsg(null)
    try {
      const res = await fetch('/api/versions', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id })
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setMsg({ type: 'ok', text: `"${label}" restored as active version.` })
      load()
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Restore failed' })
    } finally { setRestoring(null) }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="fade-up fade-up-1">
        <h1 className="text-lg font-medium text-[#E6EDF3] flex items-center gap-2">
          <History className="w-5 h-5 text-[#D4A853]" />
          Version History
        </h1>
        <p className="text-xs text-[#8B949E] mt-0.5">All Current Report imports · restore any version as active</p>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 text-sm p-3 rounded-lg border ${
          msg.type === 'ok'
            ? 'bg-[#238636]/10 border-[#238636]/30 text-[#3FB950]'
            : 'bg-[#DA3633]/10 border-[#DA3633]/30 text-[#F85149]'
        }`}>
          {msg.type === 'ok' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      <div className="card fade-up fade-up-2">
        <div className="card-header">
          <span className="card-title">{versions.length} version(s)</span>
          <button onClick={load} className="btn-ghost text-[10px]">Refresh</button>
        </div>

        {loading ? (
          <div className="p-6 text-center text-xs text-[#8B949E]">Loading…</div>
        ) : versions.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#8B949E]">
            No imports yet. Go to Import to upload your first Current Report.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Filename</th>
                  <th className="text-right">Loans</th>
                  <th>As Of</th>
                  <th>Imported</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {versions.map(v => (
                  <tr key={v.id}>
                    <td className="text-[#C9D1D9] font-medium">{v.label}</td>
                    <td className="font-mono text-[10px]">{v.filename}</td>
                    <td className="num">{v.loan_count ?? '—'}</td>
                    <td>{v.as_of_date ?? '—'}</td>
                    <td>{new Date(v.created_at).toLocaleDateString()}</td>
                    <td>
                      {v.is_active
                        ? <span className="badge badge-green">Active</span>
                        : <span className="badge badge-steel">Archived</span>
                      }
                    </td>
                    <td className="text-[10px] max-w-xs truncate">{v.notes || '—'}</td>
                    <td>
                      {!v.is_active && (
                        <button
                          onClick={() => restore(v.id, v.label)}
                          disabled={restoring === v.id}
                          className="btn-ghost flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          {restoring === v.id ? 'Restoring…' : 'Restore'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

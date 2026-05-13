'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ForecastResult, LandBucketProjectSchedule,
  LandBucketProject, Builder, LoanProgram,
} from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { ProjectModal } from '@/components/land-bucket/ProjectModal'
import { Landmark, AlertCircle, ChevronDown, ChevronRight, Plus, Pencil } from 'lucide-react'

type Mode = { kind: 'create' } | { kind: 'edit'; project: LandBucketProject } | null

export default function LandBucketPage() {
  const [forecast, setForecast]  = useState<ForecastResult | null>(null)
  const [projects, setProjects]  = useState<LandBucketProject[]>([])
  const [builders, setBuilders]  = useState<Builder[]>([])
  const [programs, setPrograms]  = useState<LoanProgram[]>([])
  const [loading, setLoading]    = useState(true)
  const [error, setError]        = useState<string | null>(null)
  const [expanded, setExpanded]  = useState<Set<string>>(new Set())
  const [modal, setModal]        = useState<Mode>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [fRes, pRes, bRes, lpRes] = await Promise.all([
        fetch('/api/calculate'),
        fetch('/api/land-bucket-projects'),
        fetch('/api/builders'),
        fetch('/api/loan-programs'),
      ])
      if (!fRes.ok)  throw new Error((await fRes.json()).error  || 'Forecast load failed')
      if (!pRes.ok)  throw new Error((await pRes.json()).error  || 'Projects load failed')
      if (!bRes.ok)  throw new Error((await bRes.json()).error  || 'Builders load failed')
      if (!lpRes.ok) throw new Error((await lpRes.json()).error || 'Programs load failed')
      setForecast(await fRes.json())
      setProjects(await pRes.json())
      setBuilders(await bRes.json())
      setPrograms(await lpRes.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const onSaved = () => { setModal(null); load() }

  if (loading) return <div className="p-6 text-[#8B949E] text-sm">Loading land bucket…</div>
  if (error)   return (
    <div className="p-6 flex gap-2 text-sm text-[#F85149]">
      <AlertCircle className="w-4 h-4 mt-0.5" />{error}
    </div>
  )
  if (!forecast) return null

  const schedules = forecast.land_bucket_schedules ?? []
  const projectsById = new Map(projects.map(p => [p.id, p]))

  const totals = schedules.reduce(
    (acc, s) => {
      const last = s.months[s.months.length - 1]
      acc.projects += 1
      acc.totalLots += s.total_lots
      acc.lotsRemaining += last?.lots_remaining ?? s.total_lots
      acc.outstanding += s.months[0]?.ending_balance ?? 0
      acc.totalInterest += s.months.reduce((sum, m) => sum + m.interest_income, 0)
      acc.totalProceeds += s.months.reduce((sum, m) => sum + m.sale_proceeds, 0)
      return acc
    },
    { projects: 0, totalLots: 0, lotsRemaining: 0, outstanding: 0, totalInterest: 0, totalProceeds: 0 },
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between fade-up fade-up-1">
        <div>
          <h1 className="text-lg font-medium text-[#E6EDF3] flex items-center gap-2">
            <Landmark className="w-5 h-5 text-[#D4A853]" />
            Land Bucket
          </h1>
          <p className="text-xs text-[#8B949E] mt-0.5">
            {totals.projects} project(s) · {forecast.version_label} · forecast horizon {forecast.months.length} months
          </p>
        </div>
        <button onClick={() => setModal({ kind: 'create' })} className="btn-primary">
          <Plus className="w-3.5 h-3.5" /> New Project
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 fade-up fade-up-2">
        <Kpi label="Outstanding (Month 1)" value={formatCurrency(totals.outstanding, true)} accent />
        <Kpi label="Total Lots"            value={totals.totalLots.toString()} />
        <Kpi label="Lots Remaining (EOH)"  value={totals.lotsRemaining.toString()} />
        <Kpi label="Total Sale Proceeds"   value={formatCurrency(totals.totalProceeds, true)} />
        <Kpi label="Total Interest Income" value={formatCurrency(totals.totalInterest, true)} />
      </div>

      {schedules.length === 0 ? (
        <div className="card p-8 text-center text-xs text-[#8B949E]">
          No land bucket projects yet. Click <strong>New Project</strong> to add one.
        </div>
      ) : (
        <div className="space-y-3 fade-up fade-up-3">
          {schedules.map(s => (
            <ProjectCard
              key={s.project_id}
              schedule={s}
              isOpen={expanded.has(s.project_id)}
              onToggle={() => toggle(s.project_id)}
              onEdit={() => {
                const p = projectsById.get(s.project_id)
                if (p) setModal({ kind: 'edit', project: p })
              }}
            />
          ))}
        </div>
      )}

      {modal && (
        <ProjectModal
          mode={modal}
          builders={builders}
          programs={programs}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`card p-4 ${accent ? 'border-[#D4A853]/30' : ''}`}>
      <div className="text-[10px] font-medium text-[#8B949E] uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-xl font-semibold font-mono ${accent ? 'text-[#D4A853]' : 'text-[#E6EDF3]'}`}>
        {value}
      </div>
    </div>
  )
}

function ProjectCard({
  schedule, isOpen, onToggle, onEdit,
}: {
  schedule: LandBucketProjectSchedule
  isOpen: boolean
  onToggle: () => void
  onEdit: () => void
}) {
  const m0 = schedule.months[0]
  const totalInterest = schedule.months.reduce((s, m) => s + m.interest_income, 0)
  const totalProceeds = schedule.months.reduce((s, m) => s + m.sale_proceeds, 0)

  return (
    <div className="card">
      <div className="px-4 py-3 flex items-center justify-between hover:bg-[#21262D]/40 transition-colors">
        <button onClick={onToggle} className="flex-1 flex items-center gap-2 text-left">
          {isOpen
            ? <ChevronDown className="w-4 h-4 text-[#8B949E]" />
            : <ChevronRight className="w-4 h-4 text-[#8B949E]" />}
          <div>
            <div className="text-sm font-medium text-[#E6EDF3]">{schedule.project_name}</div>
            <div className="text-[10px] text-[#8B949E]">
              {schedule.builder_name ?? '— no builder —'} · {schedule.total_lots} lots ·{' '}
              {schedule.absorption_rate} lots/mo · {formatCurrency(schedule.lot_price, true)}/lot
            </div>
          </div>
        </button>
        <div className="flex items-center gap-6">
          <Stat label="Outstanding" value={formatCurrency(m0?.ending_balance ?? 0, true)} />
          <Stat label="Proceeds (Σ)" value={formatCurrency(totalProceeds, true)} />
          <Stat label="Interest (Σ)" value={formatCurrency(totalInterest, true)} accent />
          <button onClick={onEdit} className="btn-ghost" title="Edit project">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-[#21262D] overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="text-right">Lots Sold</th>
                <th className="text-right">Cum</th>
                <th className="text-right">Remaining</th>
                <th className="text-right">Sale Proceeds</th>
                <th className="text-right">Ending Balance</th>
                <th className="text-right">Interest Income</th>
                <th className="text-right">New Vert. #</th>
                <th className="text-right">New Vert. $</th>
              </tr>
            </thead>
            <tbody>
              {schedule.months.map(m => (
                <tr key={m.month}>
                  <td className="text-[#C9D1D9] font-medium">{m.label}</td>
                  <td className="num">{m.lots_sold || '—'}</td>
                  <td className="num text-[#8B949E]">{m.lots_sold_cumulative}</td>
                  <td className="num text-[#8B949E]">{m.lots_remaining}</td>
                  <td className="num">{m.sale_proceeds ? formatCurrency(m.sale_proceeds, true) : '—'}</td>
                  <td className="num text-[#E6EDF3]">{formatCurrency(m.ending_balance, true)}</td>
                  <td className="num text-[#D4A853]">{formatCurrency(m.interest_income, true)}</td>
                  <td className="num">{m.new_vertical_origs_count || '—'}</td>
                  <td className="num">{m.new_vertical_origs_amount ? formatCurrency(m.new_vertical_origs_amount, true) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-[10px] text-[#8B949E] uppercase tracking-wider">{label}</div>
      <div className={`text-xs font-mono ${accent ? 'text-[#D4A853]' : 'text-[#C9D1D9]'}`}>{value}</div>
    </div>
  )
}

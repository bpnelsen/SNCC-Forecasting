'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Save, Trash2, X, AlertCircle, CheckCircle, Building2, Pencil } from 'lucide-react'
import { ParentCompany, ParentCompanyPattern, BorrowerParentMapping } from '@/lib/types'

interface Borrower { borrower: string; loan_count: number }

// Standalone Parent Companies editor lives on the Assumptions page. Manages
// its own data lifecycle (4 small endpoints), independent of the rest of the
// Assumptions form, so its save flow doesn't entangle with the global Save.
export function ParentCompaniesSection() {
  const [parents,   setParents]   = useState<ParentCompany[]>([])
  const [patterns,  setPatterns]  = useState<ParentCompanyPattern[]>([])
  const [mappings,  setMappings]  = useState<BorrowerParentMapping[]>([])
  const [borrowers, setBorrowers] = useState<Borrower[]>([])
  const [loading,   setLoading]   = useState(true)
  const [busy,      setBusy]      = useState(false)
  const [msg,       setMsg]       = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [expanded,  setExpanded]  = useState<string | null>(null)

  const load = async () => {
    setLoading(true); setMsg(null)
    // Helper: fetch + flag any non-2xx so the section surfaces the real
    // backend error (e.g. "relation parent_companies does not exist" when
    // migration 012 hasn't been applied) instead of silently rendering
    // empty lists.
    const fetchJSON = async (url: string) => {
      const r = await fetch(url, { cache: 'no-store' })
      const text = await r.text().catch(() => '')
      let body: unknown = null
      try { body = text ? JSON.parse(text) : null } catch { /* keep raw text */ }
      if (!r.ok) {
        const err = (body && typeof body === 'object' && 'error' in body)
          ? (body as { error: unknown }).error : null
        const msg = typeof err === 'string' ? err
                  : err ? JSON.stringify(err)
                  : (text || `${r.status} ${r.statusText}`)
        throw new Error(`${url}: ${msg}`)
      }
      return body
    }
    try {
      const [p, pat, m, b] = await Promise.all([
        fetchJSON('/api/parent-companies'),
        fetchJSON('/api/parent-company-patterns'),
        fetchJSON('/api/borrower-mappings'),
        fetchJSON('/api/borrowers'),
      ])
      setParents(Array.isArray(p) ? p : [])
      setPatterns(Array.isArray(pat) ? pat : [])
      setMappings(Array.isArray(m) ? m : [])
      setBorrowers(Array.isArray(b) ? b : [])
    } catch (e) {
      setMsg({
        type: 'err',
        text: e instanceof Error ? e.message : 'Failed to load parent-company data',
      })
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function readError(r: Response, fb: string) {
    const text = await r.text().catch(() => '')
    let parsed: unknown = null
    try { parsed = text ? JSON.parse(text) : null } catch {}
    const err = (parsed && typeof parsed === 'object' && 'error' in parsed)
      ? (parsed as { error: unknown }).error : null
    if (typeof err === 'string' && err.trim()) return err
    if (err && typeof err === 'object') return JSON.stringify(err)
    return `${r.status} ${r.statusText || fb}`
  }

  const addParent = async (name: string) => {
    if (!name.trim()) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/parent-companies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) throw new Error(await readError(res, 'Add failed'))
      await load()
      setMsg({ type: 'ok', text: `"${name.trim()}" added.` })
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Add failed' })
    } finally { setBusy(false) }
  }

  const renameParent = async (p: ParentCompany, newName: string) => {
    if (!newName.trim() || newName.trim() === p.name) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(`/api/parent-companies/${p.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) throw new Error(await readError(res, 'Rename failed'))
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Rename failed' })
    } finally { setBusy(false) }
  }

  const deleteParent = async (p: ParentCompany) => {
    if (!confirm(`Delete "${p.name}"? Its patterns and explicit borrower mappings will be removed too.`)) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(`/api/parent-companies/${p.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await readError(res, 'Delete failed'))
      if (expanded === p.id) setExpanded(null)
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Delete failed' })
    } finally { setBusy(false) }
  }

  const addPattern = async (parentId: string, pattern: string) => {
    if (!pattern.trim()) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/parent-company-patterns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_company_id: parentId, pattern: pattern.trim() }),
      })
      if (!res.ok) throw new Error(await readError(res, 'Add failed'))
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Add failed' })
    } finally { setBusy(false) }
  }

  const removePattern = async (id: string) => {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(`/api/parent-company-patterns/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await readError(res, 'Delete failed'))
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Delete failed' })
    } finally { setBusy(false) }
  }

  const upsertMapping = async (borrower: string, parentId: string | null) => {
    setBusy(true); setMsg(null)
    try {
      if (parentId === null) {
        const res = await fetch(`/api/borrower-mappings/${encodeURIComponent(borrower)}`, { method: 'DELETE' })
        if (!res.ok) throw new Error(await readError(res, 'Clear failed'))
      } else {
        const res = await fetch('/api/borrower-mappings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ borrower, parent_company_id: parentId }),
        })
        if (!res.ok) throw new Error(await readError(res, 'Assign failed'))
      }
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Update failed' })
    } finally { setBusy(false) }
  }

  // For each parent, build the borrower lists the UI needs:
  //   explicit = borrowers with an entry in borrower_parent_mapping
  //   matched  = borrowers a pattern would auto-grab (display only)
  const perParent = useMemo(() => {
    const patternsByParent = new Map<string, ParentCompanyPattern[]>()
    for (const pat of patterns) {
      if (!patternsByParent.has(pat.parent_company_id)) patternsByParent.set(pat.parent_company_id, [])
      patternsByParent.get(pat.parent_company_id)!.push(pat)
    }
    const explicitBorrowerById = new Map<string, string[]>()
    for (const m of mappings) {
      if (!explicitBorrowerById.has(m.parent_company_id)) explicitBorrowerById.set(m.parent_company_id, [])
      explicitBorrowerById.get(m.parent_company_id)!.push(m.borrower)
    }
    return parents.map(p => {
      const ps = patternsByParent.get(p.id) ?? []
      const explicit = (explicitBorrowerById.get(p.id) ?? []).sort()
      const explicitSet = new Set(explicit)
      const matchedByPattern = ps.length === 0 ? [] : borrowers
        .filter(b => !explicitSet.has(b.borrower))
        .filter(b => {
          const hay = b.borrower.toLowerCase()
          return ps.some(pp => pp.pattern.length > 0 && hay.includes(pp.pattern.toLowerCase()))
        })
        .map(b => b.borrower)
      return { parent: p, patterns: ps, explicit, matchedByPattern }
    })
  }, [parents, patterns, mappings, borrowers])

  // Borrowers not yet covered anywhere — useful for "which ones are still
  // unassigned?" awareness. Sorted by count desc so the biggest gaps show first.
  const unmappedBorrowers = useMemo(() => {
    const covered = new Set<string>()
    for (const m of mappings) covered.add(m.borrower)
    const patternHay = patterns.map(p => p.pattern.toLowerCase()).filter(Boolean)
    return borrowers
      .filter(b => !covered.has(b.borrower))
      .filter(b => {
        const hay = b.borrower.toLowerCase()
        return !patternHay.some(p => hay.includes(p))
      })
      .sort((a, b) => b.loan_count - a.loan_count)
  }, [borrowers, mappings, patterns])

  return (
    <div className="card fade-up fade-up-2">
      <div className="card-header flex items-center gap-2">
        <Building2 className="w-4 h-4 text-accent" />
        <span className="card-title">Parent Companies · borrower grouping</span>
      </div>

      <div className="p-4 space-y-4">
        <p className="text-xs text-fg-dim">
          Groups borrowers so the Dashboard can slice by parent. Each parent has
          a list of substring <strong>patterns</strong> (case-insensitive — any
          borrower containing the pattern is auto-assigned) and an optional
          list of <strong>explicit overrides</strong> for borrowers a pattern
          would miss or mis-classify. Explicit override wins.
        </p>

        {msg && (
          <div className={`flex items-center gap-2 text-xs p-2 rounded border ${
            msg.type === 'ok'
              ? 'bg-success/10 border-success/30 text-success-light'
              : 'bg-danger-strong/10 border-danger-strong/30 text-danger'
          }`}>
            {msg.type === 'ok' ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            {msg.text}
          </div>
        )}

        <AddParent onAdd={addParent} busy={busy} />

        {loading ? (
          <div className="text-xs text-fg-dim">Loading…</div>
        ) : parents.length === 0 ? (
          <div className="text-xs text-fg-dim italic">
            No parent companies yet. Add one above to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {perParent.map(({ parent, patterns: ps, explicit, matchedByPattern }) => (
              <ParentRow
                key={parent.id}
                parent={parent}
                patterns={ps}
                explicit={explicit}
                matched={matchedByPattern}
                borrowers={borrowers}
                allParents={parents}
                expanded={expanded === parent.id}
                onToggle={() => setExpanded(expanded === parent.id ? null : parent.id)}
                onRename={renameParent}
                onDelete={deleteParent}
                onAddPattern={addPattern}
                onRemovePattern={removePattern}
                onMap={upsertMapping}
                busy={busy}
              />
            ))}
          </div>
        )}

        {parents.length > 0 && unmappedBorrowers.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-fg-dim">
              {unmappedBorrowers.length} borrower{unmappedBorrowers.length === 1 ? '' : 's'} still unassigned
            </summary>
            <div className="mt-2 grid grid-cols-1 gap-1 max-h-60 overflow-y-auto pr-1">
              {unmappedBorrowers.map(b => (
                <div key={b.borrower}
                     className="flex items-center justify-between gap-2 px-2 py-1 border border-border-strong rounded">
                  <span className="truncate text-fg" title={b.borrower}>
                    {b.borrower} <span className="text-[10px] text-fg-dim">· {b.loan_count} loan{b.loan_count === 1 ? '' : 's'}</span>
                  </span>
                  <ParentPicker
                    parents={parents}
                    onPick={pid => upsertMapping(b.borrower, pid)}
                    disabled={busy}
                  />
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function AddParent({ onAdd, busy }: { onAdd: (n: string) => void; busy: boolean }) {
  const [name, setName] = useState('')
  return (
    <div className="flex items-center gap-2">
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { onAdd(name); setName('') } }}
        placeholder="New parent company name"
        className="form-input text-xs flex-1 max-w-xs"
      />
      <button onClick={() => { onAdd(name); setName('') }}
              disabled={busy || !name.trim()}
              className="btn-primary text-[10px]">
        <Plus className="w-3 h-3" /> Add Parent
      </button>
    </div>
  )
}

function ParentRow({
  parent, patterns, explicit, matched, borrowers, allParents,
  expanded, onToggle, onRename, onDelete, onAddPattern, onRemovePattern, onMap, busy,
}: {
  parent: ParentCompany
  patterns: ParentCompanyPattern[]
  explicit: string[]
  matched: string[]
  borrowers: Borrower[]
  allParents: ParentCompany[]
  expanded: boolean
  onToggle: () => void
  onRename: (p: ParentCompany, n: string) => void
  onDelete: (p: ParentCompany) => void
  onAddPattern: (parentId: string, pattern: string) => void
  onRemovePattern: (id: string) => void
  onMap: (borrower: string, parentId: string | null) => void
  busy: boolean
}) {
  const [editingName, setEditingName] = useState<string | null>(null)
  const [patternInput, setPatternInput] = useState('')
  const totalCovered = matched.length + explicit.length

  return (
    <div className="border border-border-strong rounded-lg">
      <div className="flex items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onToggle} className="btn-ghost text-[10px]">
            {expanded ? '▾' : '▸'}
          </button>
          {editingName === null ? (
            <span className="text-sm font-medium text-fg-strong">{parent.name}</span>
          ) : (
            <input value={editingName}
                   onChange={e => setEditingName(e.target.value)}
                   onKeyDown={e => {
                     if (e.key === 'Enter') { onRename(parent, editingName); setEditingName(null) }
                     if (e.key === 'Escape') setEditingName(null)
                   }}
                   className="form-input text-xs max-w-xs" />
          )}
          <span className="text-[10px] text-fg-dim font-mono">
            · {patterns.length} pattern{patterns.length === 1 ? '' : 's'} · {totalCovered} borrower{totalCovered === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {editingName === null
            ? <button onClick={() => setEditingName(parent.name)} className="btn-ghost"><Pencil className="w-3 h-3" /></button>
            : <button onClick={() => { onRename(parent, editingName); setEditingName(null) }}
                      disabled={busy} className="btn-primary text-[10px]"><Save className="w-3 h-3" /> Save</button>}
          <button onClick={() => onDelete(parent)} disabled={busy}
                  className="btn-ghost text-danger"><Trash2 className="w-3 h-3" /></button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-3 space-y-3">
          {/* Patterns */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-fg-dim mb-1.5">Patterns</div>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {patterns.length === 0 && (
                <span className="text-[10px] text-fg-dim italic">No patterns — borrowers reach this parent only via explicit assignment.</span>
              )}
              {patterns.map(p => (
                <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-border/40 text-[10px]">
                  <span className="font-mono text-fg">{p.pattern}</span>
                  <button onClick={() => onRemovePattern(p.id)} disabled={busy}
                          className="text-fg-dim hover:text-danger">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={patternInput}
                onChange={e => setPatternInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { onAddPattern(parent.id, patternInput); setPatternInput('') } }}
                placeholder="Substring to match (e.g. 'Holmes')"
                className="form-input text-xs flex-1 max-w-xs"
              />
              <button onClick={() => { onAddPattern(parent.id, patternInput); setPatternInput('') }}
                      disabled={busy || !patternInput.trim()}
                      className="btn-ghost text-[10px]">
                <Plus className="w-3 h-3" /> Add pattern
              </button>
            </div>
          </div>

          {/* Explicit overrides */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-fg-dim mb-1.5">
              Explicit borrower overrides
            </div>
            {explicit.length === 0 ? (
              <div className="text-[10px] text-fg-dim italic mb-2">
                No explicit overrides. Add a borrower from the dropdown below to pin it to this parent regardless of patterns.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 mb-2">
                {explicit.map(b => (
                  <div key={b} className="flex items-center justify-between gap-2 px-2 py-1 border border-border-strong rounded">
                    <span className="truncate text-xs text-fg" title={b}>{b}</span>
                    <button onClick={() => onMap(b, null)} disabled={busy}
                            className="text-fg-dim hover:text-danger">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <BorrowerPicker
                borrowers={borrowers.filter(b => !explicit.includes(b.borrower))}
                onPick={b => onMap(b, parent.id)}
                disabled={busy}
              />
              <span className="text-[10px] text-fg-dim italic">
                Pick a borrower to pin it to {parent.name}.
              </span>
            </div>
          </div>

          {/* Pattern matches (read-only display) */}
          {matched.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-fg-dim mb-1.5">
                Pattern-matched borrowers ({matched.length})
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {matched.map(b => (
                  <span key={b} className="text-[10px] px-2 py-0.5 rounded bg-border/30 text-fg-dim" title={b}>
                    {b}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BorrowerPicker({
  borrowers, onPick, disabled,
}: {
  borrowers: Borrower[]
  onPick: (b: string) => void
  disabled: boolean
}) {
  return (
    <select
      className="form-input text-xs max-w-xs"
      disabled={disabled || borrowers.length === 0}
      value=""
      onChange={e => { if (e.target.value) { onPick(e.target.value); e.currentTarget.value = '' } }}
    >
      <option value="">— pick a borrower —</option>
      {borrowers.map(b => (
        <option key={b.borrower} value={b.borrower}>{b.borrower} ({b.loan_count})</option>
      ))}
    </select>
  )
}

function ParentPicker({
  parents, onPick, disabled,
}: {
  parents: ParentCompany[]
  onPick: (id: string) => void
  disabled: boolean
}) {
  return (
    <select
      className="form-input text-[10px] py-0.5 max-w-[140px]"
      disabled={disabled || parents.length === 0}
      value=""
      onChange={e => { if (e.target.value) { onPick(e.target.value); e.currentTarget.value = '' } }}
    >
      <option value="">— assign —</option>
      {parents.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  )
}

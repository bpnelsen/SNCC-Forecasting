'use client'

// Reusable parent-company multi-select dropdown. Used by /dashboard and
// /loans for the "Parent: …" filter pill. Renders into document.body via
// portal so it can't get clipped by an ancestor's overflow-hidden or buried
// under sibling cards' stacking contexts.
//
// Selection semantics:
//   selected === null  → "All" (no filter; matches every parent)
//   selected.size === 0 → "None" (matches nothing)
//   selected.size  > 0 → matches parents whose id is in the set
//
// UNASSIGNED_PARENT_KEY is shown as "(Unassigned)" at the bottom of the list
// so loans without a parent mapping can still be filtered to / from.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Building2, Check, ChevronDown } from 'lucide-react'
import { UNASSIGNED_PARENT_KEY } from '@/lib/calculator'

export interface ParentCompanyDropdownProps {
  parents: { id: string; name: string }[]
  parentLoanCounts: Record<string, number>
  selected: Set<string> | null
  onChange: (s: Set<string> | null) => void
}

export function ParentCompanyDropdown({
  parents, parentLoanCounts, selected, onChange,
}: ParentCompanyDropdownProps) {
  const [open, setOpen]       = useState(false)
  const [pos, setPos]         = useState<{ top: number; right: number } | null>(null)
  const buttonRef             = useRef<HTMLButtonElement>(null)
  const popoverRef            = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const reposition = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setPos({
      top:   Math.round(rect.bottom + 4),
      right: Math.round(window.innerWidth - rect.right),
    })
  }

  useEffect(() => {
    if (!open) return
    reposition()
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (buttonRef.current?.contains(t)) return
      if (popoverRef.current?.contains(t)) return
      setOpen(false)
    }
    const onEsc      = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onResize   = () => reposition()
    const onScroll   = () => reposition()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll',  onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll',  onScroll, true)
    }
  }, [open])

  const rows = useMemo(() => {
    const base = parents.map(p => ({ id: p.id, name: p.name, count: parentLoanCounts[p.id] ?? 0 }))
    base.sort((a, b) => a.name.localeCompare(b.name))
    base.push({
      id: UNASSIGNED_PARENT_KEY,
      name: '(Unassigned)',
      count: parentLoanCounts[UNASSIGNED_PARENT_KEY] ?? 0,
    })
    return base
  }, [parents, parentLoanCounts])

  const label = selected === null
    ? 'Parent: All'
    : selected.size === 0
      ? 'Parent: none'
      : selected.size === 1
        ? `Parent: ${rows.find(r => r.id === Array.from(selected)[0])?.name ?? '—'}`
        : `Parent: ${selected.size} selected`

  const toggle = (id: string) => {
    const next = selected === null ? new Set<string>() : new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    onChange(next)
  }
  const selectAll  = () => onChange(null)
  const selectNone = () => onChange(new Set())

  const popover = open && pos && mounted ? createPortal(
    <div ref={popoverRef}
         style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000 }}
         className="w-64 bg-surface border border-border-strong rounded-lg shadow-xl max-h-80 overflow-y-auto">
      <div className="px-2 py-1.5 border-b border-border flex items-center justify-between text-[10px] text-fg-dim">
        <span>Parent companies</span>
        <div className="flex items-center gap-1">
          <button onClick={selectAll}  className="btn-ghost text-[10px] px-1.5 py-0.5">All</button>
          <button onClick={selectNone} className="btn-ghost text-[10px] px-1.5 py-0.5">None</button>
        </div>
      </div>
      {rows.length === 1 && rows[0].id === UNASSIGNED_PARENT_KEY ? (
        <div className="text-[10px] text-fg-dim italic px-3 py-3 space-y-1.5">
          <div>No parent companies configured.</div>
          <div>
            Add some on the Assumptions page, then hard-refresh
            (⌘⇧R / Ctrl⇧R) so this page picks them up.
          </div>
        </div>
      ) : rows.map(r => {
        const on = selected === null ? true : selected.has(r.id)
        return (
          <button key={r.id}
                  onClick={() => toggle(r.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs
                             hover:bg-border/50 text-left">
            <span className="flex items-center gap-2">
              <span className={`w-3.5 h-3.5 inline-flex items-center justify-center rounded border
                                ${on ? 'bg-accent border-accent text-accent-on' : 'border-border-strong'}`}>
                {on && <Check className="w-2.5 h-2.5" />}
              </span>
              <span className={r.id === UNASSIGNED_PARENT_KEY ? 'text-fg-dim italic' : 'text-fg'}>
                {r.name}
              </span>
            </span>
            <span className="text-[10px] text-fg-dim font-mono">{r.count}</span>
          </button>
        )
      })}
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button ref={buttonRef} onClick={() => setOpen(o => !o)}
              className="btn-ghost text-[10px] inline-flex items-center gap-1.5">
        <Building2 className="w-3 h-3" />
        {label}
        <ChevronDown className="w-3 h-3" />
      </button>
      {popover}
    </>
  )
}

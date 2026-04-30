import React, { useState } from 'react'
import { useVersion } from '../App'
import { createVersion } from '../api/versions'

export default function VersionSelector() {
  const { versions, selectedVersionId, setSelectedVersionId, refreshVersions } = useVersion()
  const [showCreate, setShowCreate] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!newLabel.trim()) return
    setCreating(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await createVersion({ label: newLabel.trim(), snapshot_date: today })
      const updated = await refreshVersions()
      setSelectedVersionId(res.data.id)
      setNewLabel('')
      setShowCreate(false)
    } catch (err) {
      console.error('Failed to create version:', err)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-2">
      <select
        value={selectedVersionId || ''}
        onChange={e => setSelectedVersionId(Number(e.target.value))}
        className="w-full bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:border-blue-400"
      >
        {versions.map(v => (
          <option key={v.id} value={v.id}>{v.label}</option>
        ))}
        {versions.length === 0 && <option value="">No versions</option>}
      </select>

      {showCreate ? (
        <div className="flex gap-1">
          <input
            type="text"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Version name..."
            className="flex-1 bg-slate-700 text-white text-xs rounded px-2 py-1 border border-slate-600 focus:outline-none focus:border-blue-400"
            autoFocus
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs rounded px-2 py-1"
          >
            {creating ? '...' : 'Add'}
          </button>
          <button
            onClick={() => setShowCreate(false)}
            className="text-slate-400 hover:text-white text-xs rounded px-1"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full text-slate-400 hover:text-white text-xs py-1 text-left"
        >
          + New version
        </button>
      )}
    </div>
  )
}

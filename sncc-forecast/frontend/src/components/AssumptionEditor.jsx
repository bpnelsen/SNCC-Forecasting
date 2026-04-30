import React, { useState } from 'react'

/**
 * Generic inline assumption editor.
 * Props:
 *   fields: [{key, label, type ('text'|'number'|'date'), step}]
 *   values: {key: value}
 *   onSave: (updatedValues) => Promise<void>
 *   onCancel: () => void
 */
export default function AssumptionEditor({ fields, values, onSave, onCancel }) {
  const [form, setForm] = useState({ ...values })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleChange = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(form)
    } catch (err) {
      setError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-3">
        {fields.map(field => (
          <div key={field.key}>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {field.label}
            </label>
            <input
              type={field.type || 'text'}
              step={field.step}
              value={form[field.key] ?? ''}
              onChange={e => handleChange(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400"
            />
          </div>
        ))}
      </div>
      {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
      <div className="flex gap-2 mt-3 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}

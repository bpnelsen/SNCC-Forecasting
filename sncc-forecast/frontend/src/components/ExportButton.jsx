import React, { useState } from 'react'
import { useVersion } from '../App'
import { exportVersion } from '../api/versions'

export default function ExportButton({ compact = false }) {
  const { selectedVersionId, versions } = useVersion()
  const [loading, setLoading] = useState(false)

  const handleExport = async () => {
    if (!selectedVersionId) return
    setLoading(true)
    try {
      const res = await exportVersion(selectedVersionId)
      const version = versions.find(v => v.id === selectedVersionId)
      const label = version?.label?.replace(/\s+/g, '_') || 'forecast'
      const today = new Date().toISOString().split('T')[0]
      const filename = `SNCC_Forecast_${label}_${today}.xlsx`

      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setLoading(false)
    }
  }

  if (compact) {
    return (
      <button
        onClick={handleExport}
        disabled={loading || !selectedVersionId}
        className="w-full flex items-center gap-2 px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg text-sm transition-colors disabled:opacity-40"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {loading ? 'Exporting...' : 'Export Excel'}
      </button>
    )
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading || !selectedVersionId}
      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      {loading ? 'Exporting...' : 'Export to Excel'}
    </button>
  )
}

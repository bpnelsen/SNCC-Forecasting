'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, X } from 'lucide-react'

interface ImportResult {
  version_id: string
  loan_count: number
  label: string
}

export default function ImportPage() {
  const [file, setFile]         = useState<File | null>(null)
  const [label, setLabel]       = useState('')
  const [notes, setNotes]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<ImportResult | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) { setFile(accepted[0]); setResult(null); setError(null) }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    maxFiles: 1,
  })

  const submit = async () => {
    if (!file) return
    setLoading(true); setError(null); setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('label', label || `Import ${new Date().toLocaleDateString()}`)
      fd.append('notes', notes)

      const res = await fetch('/api/import', { method: 'POST', body: fd })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Import failed') }
      setResult(await res.json())
      setFile(null); setLabel(''); setNotes('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="fade-up fade-up-1">
        <h1 className="text-lg font-medium text-[#E6EDF3] flex items-center gap-2">
          <Upload className="w-5 h-5 text-[#D4A853]" />
          Import Current Report
        </h1>
        <p className="text-xs text-[#8B949E] mt-0.5">Upload a .xlsx Current Report export to create a new version</p>
      </div>

      {result && (
        <div className="flex items-start gap-2 p-4 rounded-lg bg-[#238636]/10 border border-[#238636]/30 text-sm fade-up fade-up-1">
          <CheckCircle className="w-4 h-4 text-[#3FB950] mt-0.5 shrink-0" />
          <div>
            <div className="text-[#3FB950] font-medium">Import successful!</div>
            <div className="text-[#8B949E] mt-0.5 text-xs">
              "{result.label}" — {result.loan_count} loans imported and set as active version.
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-4 rounded-lg bg-[#DA3633]/10 border border-[#DA3633]/30 text-sm">
          <AlertCircle className="w-4 h-4 text-[#F85149] mt-0.5 shrink-0" />
          <div>
            <div className="text-[#F85149] font-medium">Import failed</div>
            <div className="text-[#8B949E] mt-0.5 text-xs">{error}</div>
          </div>
        </div>
      )}

      <div className="card fade-up fade-up-2">
        <div className="card-header"><span className="card-title">Upload File</span></div>
        <div className="p-4 space-y-4">
          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
              ${isDragActive
                ? 'border-[#D4A853] bg-[#D4A853]/5'
                : file
                  ? 'border-[#238636] bg-[#238636]/5'
                  : 'border-[#30363D] hover:border-[#8B949E]'
              }
            `}
          >
            <input {...getInputProps()} />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileSpreadsheet className="w-8 h-8 text-[#3FB950]" />
                <div className="text-left">
                  <div className="text-sm text-[#C9D1D9] font-medium">{file.name}</div>
                  <div className="text-xs text-[#8B949E]">{(file.size / 1024).toFixed(0)} KB</div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setFile(null) }}
                  className="ml-2 text-[#8B949E] hover:text-[#F85149]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div>
                <FileSpreadsheet className="w-8 h-8 text-[#8B949E] mx-auto mb-2" />
                <div className="text-sm text-[#C9D1D9]">
                  {isDragActive ? 'Drop the file here' : 'Drag & drop your .xlsx file here'}
                </div>
                <div className="text-xs text-[#8B949E] mt-1">or click to browse</div>
              </div>
            )}
          </div>

          {/* Version label */}
          <div>
            <label className="form-label">Version Label</label>
            <input
              className="form-input"
              placeholder="e.g. March 2026"
              value={label}
              onChange={e => setLabel(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="form-label">Notes (optional)</label>
            <textarea
              className="form-input h-20 resize-none"
              placeholder="Any notes about this import…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <button
            onClick={submit}
            disabled={!file || loading}
            className="btn-primary w-full justify-center py-2.5"
          >
            <Upload className="w-4 h-4" />
            {loading ? 'Importing…' : 'Import Report'}
          </button>
        </div>
      </div>

      {/* Help */}
      <div className="card fade-up fade-up-3 p-4">
        <div className="text-xs font-medium text-[#C9D1D9] mb-2">What happens during import?</div>
        <ul className="space-y-1.5 text-xs text-[#8B949E]">
          <li>• The "Current Report" sheet is parsed — all loan rows are extracted</li>
          <li>• Each loan is classified (SFR, MFR, A&D, Raw Land, Finished Lots, HHH)</li>
          <li>• Projected balance = MAX(disbursed, loan_amount × draw%)</li>
          <li>• This version is set as active — the dashboard updates automatically</li>
          <li>• Prior versions are preserved in Version History</li>
        </ul>
      </div>
    </div>
  )
}

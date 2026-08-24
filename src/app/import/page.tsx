'use client'

import { useCallback, useState } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, X } from 'lucide-react'

interface ImportResult {
  version_id: string
  loan_count: number
  label: string
  warnings?: string[]
}

export default function ImportPage() {
  const [file, setFile]         = useState<File | null>(null)
  const [label, setLabel]       = useState('')
  const [notes, setNotes]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<ImportResult | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const onDrop = useCallback((accepted: File[], rejected: FileRejection[]) => {
    if (accepted[0]) {
      setFile(accepted[0]); setResult(null); setError(null)
      return
    }
    // Without this, an unsupported file (a .csv, a .pdf, an old .xls when the
    // accept list excluded it) was dropped and *nothing* happened at all — no
    // file, no message, no clue why.
    if (rejected.length > 0) {
      const r = rejected[0]
      setFile(null); setResult(null)
      setError(
        `"${r.file.name}" wasn't accepted: ${r.errors.map(e => e.message).join('; ')}. ` +
        'Supported formats are .xlsx, .xlsm and .xls, up to 4 MB.',
      )
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    // The Current Report is exported as .xlsx, but macro-enabled (.xlsm) and
    // legacy (.xls) workbooks parse identically and used to be rejected in
    // silence. Extensions are listed as well as MIME types because browsers
    // report these inconsistently.
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
    // Matches the server-side guard; Vercel rejects bodies over ~4.5 MB.
    maxSize: 4 * 1024 * 1024,
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
    <div className="p-6 space-y-6 max-w-[747px]">
      <div className="fade-up fade-up-1">
        <h1 className="text-lg font-medium text-fg-strong flex items-center gap-2">
          <Upload className="w-5 h-5 text-accent" />
          Import Current Report
        </h1>
        <p className="text-xs text-fg-dim mt-0.5">Upload a .xlsx Current Report export to create a new version</p>
      </div>

      {result && (
        <div className="flex items-start gap-2 p-4 rounded-lg bg-success/10 border border-success/30 text-sm fade-up fade-up-1">
          <CheckCircle className="w-4 h-4 text-success-light mt-0.5 shrink-0" />
          <div>
            <div className="text-success-light font-medium">Import successful!</div>
            <div className="text-fg-dim mt-0.5 text-xs">
              &ldquo;{result.label}&rdquo; — {result.loan_count} loans imported and set as active version.
            </div>
            {result.warnings && result.warnings.length > 0 && (
              <ul className="mt-2 space-y-1">
                {result.warnings.map((w, i) => (
                  <li key={i} className="text-[11px] text-danger flex items-start gap-1.5">
                    <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-4 rounded-lg bg-danger-strong/10 border border-danger-strong/30 text-sm">
          <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
          <div>
            <div className="text-danger font-medium">Import failed</div>
            <div className="text-fg-dim mt-0.5 text-xs">{error}</div>
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
                ? 'border-accent bg-accent/5'
                : file
                  ? 'border-success bg-success/5'
                  : 'border-border-strong hover:border-fg-dim'
              }
            `}
          >
            <input {...getInputProps()} />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileSpreadsheet className="w-8 h-8 text-success-light" />
                <div className="text-left">
                  <div className="text-sm text-fg font-medium">{file.name}</div>
                  <div className="text-xs text-fg-dim">{(file.size / 1024).toFixed(0)} KB</div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setFile(null) }}
                  className="ml-2 text-fg-dim hover:text-danger"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div>
                <FileSpreadsheet className="w-8 h-8 text-fg-dim mx-auto mb-2" />
                <div className="text-sm text-fg">
                  {isDragActive ? 'Drop the file here' : 'Drag & drop your .xlsx file here'}
                </div>
                <div className="text-xs text-fg-dim mt-1">or click to browse</div>
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
        <div className="text-xs font-medium text-fg mb-2">What happens during import?</div>
        <ul className="space-y-1.5 text-xs text-fg-dim">
          <li>• The first sheet with a recognizable header row is parsed (any sheet name works)</li>
          <li>• Each loan is classified (SFR, MFR, A&D, Raw Land, Finished Lots, HHH)</li>
          <li>• Projected balance = MAX(disbursed, loan_amount × draw%)</li>
          <li>• This version is set as active — the dashboard updates automatically</li>
          <li>• Prior versions are preserved in Version History</li>
        </ul>
      </div>
    </div>
  )
}

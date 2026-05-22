import React, { useRef, useState } from 'react'
import axios from 'axios'
import { useVersion } from '../App'

export default function ImportCard({ title, endpoint, onSuccess, accept = '.xlsx' }) {
  const { selectedVersionId } = useVersion()
  const fileRef = useRef(null)
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    setFile(f || null)
    setResult(null)
    setError(null)
  }

  const handleUpload = async () => {
    if (!file || !selectedVersionId) {
      setError(!selectedVersionId ? 'Please select a version first.' : 'Please select a file.')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await axios.post(`/api${endpoint}?version_id=${selectedVersionId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setResult(res.data)
      if (onSuccess) onSuccess(res.data)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed. Please check the file format.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500">Upload {accept} file</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 transition-colors">
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            onChange={handleFileChange}
            className="hidden"
            id={`file-${endpoint}`}
          />
          <label htmlFor={`file-${endpoint}`} className="cursor-pointer">
            {file ? (
              <div>
                <p className="text-sm font-medium text-blue-600">{file.name}</p>
                <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500">Click to select file</p>
                <p className="text-xs text-gray-400">or drag and drop</p>
              </div>
            )}
          </label>
        </div>

        <button
          onClick={handleUpload}
          disabled={loading || !file}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Importing...
            </span>
          ) : 'Import'}
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3">
            {error}
          </div>
        )}

        {result && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg p-3">
            <p className="font-medium">Import successful!</p>
            {result.imported != null && <p>{result.imported} records imported</p>}
            {result.flagged != null && result.flagged > 0 && (
              <p className="text-amber-600 font-medium">{result.flagged} loans flagged for review</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

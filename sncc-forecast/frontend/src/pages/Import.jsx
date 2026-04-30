import React, { useState } from 'react'
import ImportCard from '../components/ImportCard'
import FlaggedLoanTable from '../components/FlaggedLoanTable'
import { useVersion } from '../App'

export default function Import() {
  const { selectedVersionId } = useVersion()
  const [flaggedLoans, setFlaggedLoans] = useState([])
  const [showFlagged, setShowFlagged] = useState(false)

  const handleCurrentReportSuccess = (data) => {
    if (data.flagged_loans && data.flagged_loans.length > 0) {
      setFlaggedLoans(data.flagged_loans)
      setShowFlagged(true)
    } else {
      setFlaggedLoans([])
      setShowFlagged(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Import Data</h1>
        <p className="text-sm text-gray-500 mt-1">
          {selectedVersionId
            ? 'Upload Excel files to import loan data, land bucket, and HHH investments.'
            : 'Please select a version first.'}
        </p>
      </div>

      {!selectedVersionId && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-lg p-4 text-sm">
          Please select or create a forecast version before importing data.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ImportCard
          title="Current Report"
          endpoint="/import/current-report"
          onSuccess={handleCurrentReportSuccess}
        />
        <ImportCard
          title="Land Bucket"
          endpoint="/import/land-bucket"
        />
        <ImportCard
          title="HHH Investments"
          endpoint="/import/hhh"
        />
      </div>

      {/* Import guide */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h3 className="font-semibold text-blue-800 mb-3">Import Format Guide</h3>
        <div className="grid grid-cols-3 gap-4 text-sm text-blue-700">
          <div>
            <p className="font-medium mb-1">Current Report</p>
            <ul className="list-disc list-inside space-y-1 text-xs text-blue-600">
              <li>Sheet: "Current Report"</li>
              <li>Columns: Loan Number, Borrower</li>
              <li>Loan Program, Loan Amount</li>
              <li>Funded Date, Maturity Date</li>
              <li>Current Balance, Interest Rate</li>
            </ul>
          </div>
          <div>
            <p className="font-medium mb-1">Land Bucket</p>
            <ul className="list-disc list-inside space-y-1 text-xs text-blue-600">
              <li>Sheet: "LB Data" (project data)</li>
              <li>Sheet: "LB Status" (current balances)</li>
              <li>Columns: Dept Code, Builder</li>
              <li>Project Code, Phase, Lots</li>
              <li>Total Budget, Development Costs</li>
            </ul>
          </div>
          <div>
            <p className="font-medium mb-1">HHH Investments</p>
            <ul className="list-disc list-inside space-y-1 text-xs text-blue-600">
              <li>Sheet: "HHH_OW_MMC"</li>
              <li>Investment names in rows</li>
              <li>HH_TOM, HHH_OW, HH-JKSN</li>
              <li>Balance, loan amount</li>
              <li>Monthly increase/deduction</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Flagged Loans */}
      {showFlagged && flaggedLoans.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-300 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 bg-amber-50 border-b border-amber-200">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-amber-800">
                  {flaggedLoans.length} Loans Flagged for Review
                </h2>
                <p className="text-xs text-amber-600">Review and optionally override monthly draw amounts</p>
              </div>
            </div>
            <button
              onClick={() => setShowFlagged(false)}
              className="text-amber-400 hover:text-amber-600"
            >
              ✕
            </button>
          </div>
          <FlaggedLoanTable loans={flaggedLoans} />
        </div>
      )}
    </div>
  )
}

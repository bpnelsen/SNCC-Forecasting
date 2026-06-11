'use client'

import { ClipboardCheck } from 'lucide-react'
import { ApprovedLoansTable } from '@/components/approved/ApprovedLoansTable'

// Pipeline view: every committee-approved loan that hasn't closed yet.
// Editing a row's Status to Closed / Cancelled routes it to /closed
// automatically — same underlying table, different scope.
export default function ApprovedLoansPage() {
  return (
    <ApprovedLoansTable
      scope={['Open', 'Expired']}
      defaultStatus="Open"
      title="Approved Loans"
      subtitle="Committee-approved loans awaiting closing"
      icon={ClipboardCheck}
    />
  )
}

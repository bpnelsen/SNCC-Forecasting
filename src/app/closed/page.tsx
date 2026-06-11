'use client'

import { CheckSquare } from 'lucide-react'
import { ApprovedLoansTable } from '@/components/approved/ApprovedLoansTable'

// History view: every committee-approved loan that has closed or been
// cancelled. Same underlying table as /approved; the row arrived here by
// having its Status edited to Closed or Cancelled on the pipeline page.
export default function ClosedLoansPage() {
  return (
    <ApprovedLoansTable
      scope={['Closed', 'Cancelled']}
      defaultStatus="Closed"
      title="Closed Loans"
      subtitle="Approved-loan history — closed or cancelled"
      icon={CheckSquare}
    />
  )
}

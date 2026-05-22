import client from './client'

export const getLoans = (versionId, params) =>
  client.get(`/api/versions/${versionId}/loans`, { params })

export const updateLoan = (versionId, loanId, data) =>
  client.patch(`/api/versions/${versionId}/loans/${loanId}`, data)

export const getLoanProjections = (versionId, loanId, numMonths = 24) =>
  client.get(`/api/versions/${versionId}/loans/${loanId}/projections`, {
    params: { num_months: numMonths }
  })

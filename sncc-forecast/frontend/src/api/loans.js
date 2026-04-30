import axios from 'axios'

export const getLoans = (versionId, params) =>
  axios.get(`/api/versions/${versionId}/loans`, { params })

export const updateLoan = (versionId, loanId, data) =>
  axios.patch(`/api/versions/${versionId}/loans/${loanId}`, data)

export const getLoanProjections = (versionId, loanId, numMonths = 24) =>
  axios.get(`/api/versions/${versionId}/loans/${loanId}/projections`, {
    params: { num_months: numMonths }
  })

import axios from 'axios'

export const getProfitSharing = (versionId) =>
  axios.get(`/api/versions/${versionId}/profit-sharing`)

export const updateProfitSharing = (versionId, data) =>
  axios.put(`/api/versions/${versionId}/profit-sharing`, data)

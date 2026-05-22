import client from './client'

export const getProfitSharing = (versionId) =>
  client.get(`/api/versions/${versionId}/profit-sharing`)

export const updateProfitSharing = (versionId, data) =>
  client.put(`/api/versions/${versionId}/profit-sharing`, data)

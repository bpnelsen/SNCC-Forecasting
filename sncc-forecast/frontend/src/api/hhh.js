import client from './client'

export const getHHH = (versionId) =>
  client.get(`/api/versions/${versionId}/hhh`)

export const updateHHH = (versionId, investmentId, data) =>
  client.put(`/api/versions/${versionId}/hhh/${investmentId}`, data)

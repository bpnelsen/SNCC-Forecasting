import client from './client'

export const getLandBucket = (versionId) =>
  client.get(`/api/versions/${versionId}/land-bucket`)

export const updateLBMonthly = (versionId, projectId, data) =>
  client.put(`/api/versions/${versionId}/land-bucket/${projectId}/monthly`, data)

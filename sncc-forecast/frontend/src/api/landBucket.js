import axios from 'axios'

export const getLandBucket = (versionId) =>
  axios.get(`/api/versions/${versionId}/land-bucket`)

export const updateLBMonthly = (versionId, projectId, data) =>
  axios.put(`/api/versions/${versionId}/land-bucket/${projectId}/monthly`, data)

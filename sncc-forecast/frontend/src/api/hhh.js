import axios from 'axios'

export const getHHH = (versionId) =>
  axios.get(`/api/versions/${versionId}/hhh`)

export const updateHHH = (versionId, investmentId, data) =>
  axios.put(`/api/versions/${versionId}/hhh/${investmentId}`, data)

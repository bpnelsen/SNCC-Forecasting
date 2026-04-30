import axios from 'axios'

export const getNHC = (versionId) =>
  axios.get(`/api/versions/${versionId}/nhc`)

export const updateNHC = (versionId, data) =>
  axios.put(`/api/versions/${versionId}/nhc`, data)

export const getDrawCurves = (versionId) =>
  axios.get(`/api/versions/${versionId}/draw-curves`)

export const updateDrawCurves = (versionId, data) =>
  axios.put(`/api/versions/${versionId}/draw-curves`, data)

import client from './client'

export const getNHC = (versionId) =>
  client.get(`/api/versions/${versionId}/nhc`)

export const updateNHC = (versionId, data) =>
  client.put(`/api/versions/${versionId}/nhc`, data)

export const getDrawCurves = (versionId) =>
  client.get(`/api/versions/${versionId}/draw-curves`)

export const updateDrawCurves = (versionId, data) =>
  client.put(`/api/versions/${versionId}/draw-curves`, data)

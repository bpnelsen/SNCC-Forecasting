import axios from 'axios'

const API = '/api'

export const getVersions = () => axios.get(`${API}/versions`)
export const createVersion = (data) => axios.post(`${API}/versions`, data)
export const getSummary = (id, numMonths = 12) => axios.get(`${API}/versions/${id}/summary`, { params: { num_months: numMonths } })
export const getYield = (id, lbRate = 0.0525) => axios.get(`${API}/versions/${id}/yield`, { params: { lb_rate: lbRate } })
export const exportVersion = (id) => axios.get(`${API}/versions/${id}/export`, { responseType: 'blob' })

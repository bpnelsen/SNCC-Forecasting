import client from './client'



export const getVersions = () => client.get(`${API}/versions`)
export const createVersion = (data) => client.post(`${API}/versions`, data)
export const getSummary = (id, numMonths = 12) => client.get(`${API}/versions/${id}/summary`, { params: { num_months: numMonths } })
export const getYield = (id, lbRate = 0.0525) => client.get(`${API}/versions/${id}/yield`, { params: { lb_rate: lbRate } })
export const exportVersion = (id) => client.get(`${API}/versions/${id}/export`, { responseType: 'blob' })

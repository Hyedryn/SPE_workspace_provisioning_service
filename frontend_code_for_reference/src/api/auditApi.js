import { apiClient } from './client.js'

export const getPermitActivity = async (permitId, params = {}) => {
  const response = await apiClient.get(`/permits/${permitId}/activity`, {
    params,
  })
  return response.data
}

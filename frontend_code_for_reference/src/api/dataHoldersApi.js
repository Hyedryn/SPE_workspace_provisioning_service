import { apiClient } from './client.js'

export const searchDataHolders = async (query) => {
  const response = await apiClient.get('/data-holders', {
    params: { q: query },
  })
  return response.data
}

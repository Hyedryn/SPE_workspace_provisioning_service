import { apiClient } from './client.js'

export const searchHdabStaff = async (query) => {
  const response = await apiClient.get('/hdab/staff', {
    params: { q: query },
  })
  return response.data
}

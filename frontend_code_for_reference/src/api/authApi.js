import { apiClient } from './client.js'

export const loginRequest = async (credentials) => {
  const response = await apiClient.post('/auth/login', credentials)
  return response.data
}

export const fetchCurrentUser = async () => {
  const response = await apiClient.get('/me')
  return response.data
}

export const logoutRequest = async () => {
  const response = await apiClient.post('/auth/logout')
  return response.data
}

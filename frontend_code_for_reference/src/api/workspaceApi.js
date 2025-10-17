import { apiClient } from './client.js'

export const startWorkspace = async (permitId) => {
  const response = await apiClient.post(
    `/permits/${permitId}/workspace/start`,
  )
  return response.data
}

export const stopWorkspace = async (permitId) => {
  const response = await apiClient.post(
    `/permits/${permitId}/workspace/stop`,
  )
  return response.data
}

export const getWorkspaceStatus = async (permitId) => {
  const response = await apiClient.get(`/permits/${permitId}/workspace/status`)
  return response.data
}

export const getWorkspaceConnection = async (permitId, type, options = {}) => {
  const params = { type }

  if (options?.reviewerMode) {
    params.reviewerMode = options.reviewerMode
  }

  const response = await apiClient.get(
    `/permits/${permitId}/workspace/connection`,
    { params },
  )
  return response.data
}

export const submitWorkspaceForReview = async (permitId) => {
  const response = await apiClient.post(
    `/permits/${permitId}/workspace/submit-for-review`,
  )
  return response.data
}

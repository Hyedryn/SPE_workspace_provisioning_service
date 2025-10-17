import { apiClient } from './client.js'

export const submitOutput = async (permitId, payload) => {
  const response = await apiClient.post(
    `/permits/${permitId}/outputs`,
    payload,
  )
  return response.data
}

export const getOutputsForPermit = async (permitId) => {
  const response = await apiClient.get(`/permits/${permitId}/outputs`)
  return response.data
}

export const getOutputById = async (permitId, outputId) => {
  const response = await apiClient.get(
    `/permits/${permitId}/outputs/${outputId}`,
  )
  return response.data
}

export const submitOutputReview = async (permitId, outputId, payload) => {
  const response = await apiClient.post(
    `/permits/${permitId}/outputs/${outputId}/review`,
    payload,
  )
  return response.data
}

export const getOutputDownloadLink = async (permitId, outputId) => {
  const response = await apiClient.get(
    `/permits/${permitId}/outputs/${outputId}/download-link`,
  )
  return response.data
}

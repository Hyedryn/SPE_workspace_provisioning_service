import { apiClient } from './client.js'

export const getPermits = async (params = {}) => {
  const response = await apiClient.get('/permits', { params })
  return response.data
}

export const getPermitById = async (permitId) => {
  const response = await apiClient.get(`/permits/${permitId}`)
  return response.data
}

export const submitPermitReview = async (permitId, payload) => {
  const response = await apiClient.post(
    `/permits/${permitId}/review`,
    payload,
  )
  return response.data
}

export const invitePermitCollaborator = async (permitId, payload) => {
  const response = await apiClient.post(
    `/permits/${permitId}/team/invite`,
    payload,
  )
  return response.data
}

export const removePermitCollaborator = async (permitId, memberId) => {
  const response = await apiClient.delete(
    `/permits/${permitId}/team/${memberId}`,
  )
  return response.data
}

export const assignHdabTeamMember = async (permitId, payload) => {
  const response = await apiClient.post(
    `/permits/${permitId}/hdab-team`,
    payload,
  )
  return response.data
}

export const removeHdabTeamMember = async (permitId, userId, permitRole) => {
  const response = await apiClient.delete(
    `/permits/${permitId}/hdab-team/${userId}`,
    { params: { permitRole } },
  )
  return response.data
}

export const initiateDataIngress = async (permitId) => {
  const response = await apiClient.post(
    `/permits/${permitId}/initiate-ingress`,
  )
  return response.data
}

export const confirmIngressUpload = async (permitId) => {
  const response = await apiClient.post(
    `/permits/${permitId}/confirm-upload`,
  )
  return response.data
}

export const assignDataHolder = async (permitId, payload) => {
  const response = await apiClient.post(
    `/permits/${permitId}/data-holders`,
    payload,
  )
  return response.data
}

export const removeDataHolder = async (permitId, holderId) => {
  const response = await apiClient.delete(
    `/permits/${permitId}/data-holders/${holderId}`,
  )
  return response.data
}

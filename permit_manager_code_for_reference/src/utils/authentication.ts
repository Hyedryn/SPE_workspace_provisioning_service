import crypto from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import env from '../config'
import { AuthenticatedUser, UserRole } from '../types/user'
import { normalizeEmail } from './strings'

const USER_HEADER = 'x-user-info'

type GatewayUserPayload = {
  sub?: string
  id?: string
  email?: string
  fullName?: string
  organization?: string
  roles?: unknown
  exp?: number
  iat?: number
}

const decodeBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const paddingLength = normalized.length % 4
  const padded = paddingLength === 0 ? normalized : normalized.padEnd(normalized.length + (4 - paddingLength), '=')
  return Buffer.from(padded, 'base64').toString('utf-8')
}

const safeJsonParse = <T>(value: string): T | null => {
  try {
    const parsed = JSON.parse(value) as T
    return parsed
  } catch {
    return null
  }
}

const validateAndDecodeToken = (token: string): GatewayUserPayload | null => {
  if (!env.API_GATEWAY_SECRET) {
    return null
  }

  const segments = token.split('.')
  if (segments.length !== 3) {
    return null
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments

  const headerJson = safeJsonParse<{ alg?: string; typ?: string }>(decodeBase64Url(encodedHeader))
  if (!headerJson || headerJson.alg !== 'HS256' || headerJson.typ !== 'JWT') {
    return null
  }

  const expectedSignature = crypto
    .createHmac('sha256', env.API_GATEWAY_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url')

  const providedSignatureBuffer = Buffer.from(encodedSignature.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  const expectedSignatureBuffer = Buffer.from(expectedSignature.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

  if (
    providedSignatureBuffer.length === 0 ||
    providedSignatureBuffer.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer)
  ) {
    return null
  }

  const payloadJson = safeJsonParse<GatewayUserPayload>(decodeBase64Url(encodedPayload))
  if (!payloadJson || typeof payloadJson.email !== 'string') {
    return null
  }

  if (typeof payloadJson.exp === 'number' && Number.isFinite(payloadJson.exp)) {
    const now = Math.floor(Date.now() / 1000)
    if (payloadJson.exp < now) {
      return null
    }
  }

  return payloadJson
}

const coerceRoles = (roles: unknown): UserRole[] => {
  if (!Array.isArray(roles)) {
    return []
  }

  return roles.filter((role): role is UserRole => typeof role === 'string')
}

export const extractUserFromRequest = (request: FastifyRequest): AuthenticatedUser | null => {
  const header = request.headers[USER_HEADER] ?? request.headers[USER_HEADER as keyof typeof request.headers]

  if (!header) {
    return null
  }

  const headerValue = Array.isArray(header) ? header[0] : header
  if (typeof headerValue !== 'string') {
    return null
  }

  const payload = validateAndDecodeToken(headerValue)
  if (!payload) {
    return null
  }

  const id = typeof payload.sub === 'string' ? payload.sub : typeof payload.id === 'string' ? payload.id : null
  if (!id) {
    return null
  }

  return {
    id,
    email: payload.email,
    fullName: payload.fullName,
    organization: payload.organization,
    roles: coerceRoles(payload.roles),
  }
}

export const emailsMatch = (a?: string | null, b?: string | null): boolean => {
  const normalizedA = normalizeEmail(a)
  const normalizedB = normalizeEmail(b)
  return Boolean(normalizedA && normalizedB && normalizedA === normalizedB)
}

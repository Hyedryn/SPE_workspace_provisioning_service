import prisma from '../lib/prisma'
import type { AuthenticatedUser } from '../types/user'
import type { PermitStatus, ReviewDecision, ReviewStage } from '../types/permit'
import type { PermitWithRelations } from '../types/database'
import type { Prisma } from '@prisma/client'
import {
  userHasPermitAccess,
  getHdabRolesForUser,
  getPermitRole,
} from '../utils/permitAccess'
import { buildPermitResponse } from '../transformers/permitTransformer'
import eventPublisher from '../events/eventPublisher'
import { isHdabPermitManager, isSuperAdmin } from '../utils/authorization'
const permitIncludes = {
  teamMembers: true,
  hdabAssignments: true,
  dataHolderAssignments: true,
  outputs: true,
} as const

const isRecordNotFoundError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as { name?: string; code?: string }
  return candidate?.name === 'NotFoundError' || candidate?.code === 'P2025'
}

export const PermitService = {
  async listPermitsForUser(user: AuthenticatedUser, status?: string) {
    const where = status ? { status } : {}
    const permits = (await prisma.permit.findMany({
      where,
      include: permitIncludes,
      orderBy: { updatedAt: 'desc' },
    })) as PermitWithRelations[]

    return permits.filter((permit) => userHasPermitAccess(permit, user))
  },

  async getPermitOrThrow(permitId: string): Promise<PermitWithRelations> {
    try {
      return (await prisma.permit.findUniqueOrThrow({
        where: { id: permitId },
        include: permitIncludes,
      })) as PermitWithRelations
    } catch (error: unknown) {
      if (isRecordNotFoundError(error)) {
        const notFoundError = new Error('Permit not found')
        ;(notFoundError as Error & { statusCode?: number }).statusCode = 404
        throw notFoundError
      }

      throw error
    }
  },

  async getPermitForUser(permitId: string, user: AuthenticatedUser) {
    const permit = await this.getPermitOrThrow(permitId)

    if (!userHasPermitAccess(permit, user)) {
      const error = new Error('Forbidden')
      ;(error as Error & { statusCode?: number }).statusCode = 403
      throw error
    }

    return buildPermitResponse(permit, user)
  },

  async updateStatus(
    permitId: string,
    newStatus: PermitStatus,
    actor: AuthenticatedUser,
    comments?: string,
  ) {
    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const permit = await tx.permit.findUniqueOrThrow({ where: { id: permitId } })
      const previousStatus = permit.status

      const result = await tx.permit.update({
        where: { id: permitId },
        data: { status: newStatus },
        include: permitIncludes,
      })

      await tx.permitStateLog.create({
        data: {
          permitId,
          userId: actor.id,
          previousStatus,
          newStatus,
          comments,
        },
      })

      await tx.permitActivityLog.create({
        data: {
          permitId,
          type: 'PERMIT_STATUS_UPDATED',
          description: `Status changed from ${previousStatus} to ${newStatus}.`,
          actorUserId: actor.id,
          actorName: actor.fullName,
          actorEmail: actor.email,
          metadata: { previousStatus, newStatus },
        },
      })

      return result
    })

    await eventPublisher.publish({
      name: 'status.updated',
      payload: { permit: updated },
    })

    return updated
  },

  async recordActivity(
    permitId: string,
    actor: AuthenticatedUser,
    type: string,
    description: string,
    metadata?: Record<string, unknown>,
    targetUser?: { id?: string; name?: string | null; email?: string | null; organization?: string | null },
  ) {
    await prisma.permitActivityLog.create({
      data: {
        permitId,
        type,
        description,
        actorUserId: actor.id,
        actorName: actor.fullName,
        actorEmail: actor.email,
        metadata: metadata ?? {},
        targetUser,
      },
    })
  },

  async ensureReviewPermission(
    permit: PermitWithRelations,
    user: AuthenticatedUser,
    requiredRoles: string[],
  ) {
    if (isSuperAdmin(user)) {
      return
    }

    if (!isHdabPermitManager(user)) {
      const roles = getHdabRolesForUser(permit, user)
      const hasRole = requiredRoles.some((role) => roles.includes(role))
      if (!hasRole) {
        const error = new Error('Forbidden')
        ;(error as Error & { statusCode?: number }).statusCode = 403
        throw error
      }
    }
  },
}

export const reviewTransitions: Record<
  ReviewStage,
  Record<ReviewDecision, { next: PermitStatus; allowed: PermitStatus[]; requiredRoles: string[]; message: string }>
> = {
  PREPARATION: {
    SUBMIT_FOR_REVIEW: {
      next: 'DATA_PREPARATION_REVIEW_PENDING',
      allowed: ['DATA_PREPARATION_PENDING', 'DATA_PREPARATION_REWORK'],
      requiredRoles: ['HDAB_DATA_PREPARATOR'],
      message: 'Preparation submitted for HDAB review.',
    },
    APPROVED: {
      next: 'WORKSPACE_SETUP_PENDING',
      allowed: ['DATA_PREPARATION_REVIEW_PENDING'],
      requiredRoles: ['HDAB_DATA_REVIEWER'],
      message: 'Preparation approved. Permit now awaiting workspace setup.',
    },
    REWORK_REQUESTED: {
      next: 'DATA_PREPARATION_REWORK',
      allowed: ['DATA_PREPARATION_REVIEW_PENDING'],
      requiredRoles: ['HDAB_DATA_REVIEWER'],
      message: 'Preparation rework requested.',
    },
  },
  SETUP: {
    APPROVED: {
      next: 'ANALYSIS_ACTIVE',
      allowed: ['WORKSPACE_SETUP_REVIEW_PENDING'],
      requiredRoles: ['HDAB_SETUP_REVIEWER'],
      message: 'Workspace setup approved. Analysis may begin.',
    },
    REWORK_REQUESTED: {
      next: 'WORKSPACE_SETUP_REWORK',
      allowed: ['WORKSPACE_SETUP_REVIEW_PENDING'],
      requiredRoles: ['HDAB_SETUP_REVIEWER'],
      message: 'Setup rework requested from the project team.',
    },
    SUBMIT_FOR_REVIEW: {
      next: 'WORKSPACE_SETUP_REVIEW_PENDING',
      allowed: ['WORKSPACE_SETUP_PENDING', 'WORKSPACE_SETUP_REWORK'],
      requiredRoles: ['PROJECT_INVESTIGATOR', 'PROJECT_MEMBER', 'HDAB_SETUP_ENGINEER'],
      message: 'Workspace setup submitted for review.',
    },
  },
}

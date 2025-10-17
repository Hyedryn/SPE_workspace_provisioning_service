import prisma from '../lib/prisma'
import type { PermitWithRelations } from '../types/database'
import type { AuthenticatedUser } from '../types/user'
import { canAssignHdabTeam, getHdabAssignmentsGrouped } from '../utils/permitAccess'
import { isValidHdabPermitRole } from '../utils/authorization'
import eventPublisher from '../events/eventPublisher'
import { PermitService } from './permitService'

export const HdabTeamService = {
  async assign(
    permit: PermitWithRelations,
    actor: AuthenticatedUser,
    payload: { userId: string; permitRole: string },
  ) {
    if (!canAssignHdabTeam(actor)) {
      const error = new Error('Forbidden')
      ;(error as Error & { statusCode?: number }).statusCode = 403
      throw error
    }

    if (!payload.userId || !payload.permitRole) {
      const error = new Error('User and permit role are required.')
      ;(error as Error & { statusCode?: number }).statusCode = 400
      throw error
    }

    if (!isValidHdabPermitRole(payload.permitRole)) {
      const error = new Error('Invalid HDAB permit role specified.')
      ;(error as Error & { statusCode?: number }).statusCode = 400
      throw error
    }

    const existingGroup = getHdabAssignmentsGrouped(permit)
    const existingRoles = existingGroup.get(payload.userId)
    if (existingRoles?.has(payload.permitRole)) {
      const error = new Error('User already holds this HDAB role on the permit.')
      ;(error as Error & { statusCode?: number }).statusCode = 409
      throw error
    }

    await prisma.hdabAssignment.create({
      data: {
        permitId: permit.id,
        userId: payload.userId,
        permitRole: payload.permitRole,
      },
    })

    await PermitService.recordActivity(
      permit.id,
      actor,
      'HDAB_TEAM_MEMBER_ASSIGNED',
      `Assigned ${payload.userId} to ${payload.permitRole}.`,
      { userId: payload.userId, permitRole: payload.permitRole },
    )

    await eventPublisher.publish({
      name: 'hdab_team.member_assigned',
      payload: {
        permitId: permit.id,
        userId: payload.userId,
        permitRole: payload.permitRole,
      },
    })
  },

  async remove(
    permit: PermitWithRelations,
    actor: AuthenticatedUser,
    userId: string,
    permitRole: string,
  ) {
    if (!canAssignHdabTeam(actor)) {
      const error = new Error('Forbidden')
      ;(error as Error & { statusCode?: number }).statusCode = 403
      throw error
    }

    if (!isValidHdabPermitRole(permitRole)) {
      const error = new Error('Invalid HDAB permit role specified.')
      ;(error as Error & { statusCode?: number }).statusCode = 400
      throw error
    }

    const assignment = await prisma.hdabAssignment.findUnique({
      where: {
        permitId_userId_permitRole: {
          permitId: permit.id,
          userId,
          permitRole,
        },
      },
    })

    if (!assignment) {
      const error = new Error('HDAB team member not found on this permit.')
      ;(error as Error & { statusCode?: number }).statusCode = 404
      throw error
    }

    await prisma.hdabAssignment.delete({
      where: { id: assignment.id },
    })

    await PermitService.recordActivity(
      permit.id,
      actor,
      'HDAB_TEAM_MEMBER_REMOVED',
      `Removed ${userId} (${permitRole}) from the HDAB team.`,
      { userId, permitRole },
    )

    await eventPublisher.publish({
      name: 'hdab_team.member_removed',
      payload: {
        permitId: permit.id,
        userId,
        permitRole,
      },
    })
  },
}

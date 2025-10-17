import prisma from '../lib/prisma'
import type { PermitWithRelations } from '../types/database'
import type { AuthenticatedUser } from '../types/user'
import { isSuperAdmin, isHdabPermitManager } from '../utils/authorization'
import { normalizeEmail } from '../utils/strings'
import eventPublisher from '../events/eventPublisher'
import { PermitService } from './permitService'

export const DataHolderService = {
  ensureManager(user: AuthenticatedUser) {
    if (isSuperAdmin(user) || isHdabPermitManager(user)) {
      return
    }
    const error = new Error('Forbidden')
    ;(error as Error & { statusCode?: number }).statusCode = 403
    throw error
  },

  async assign(
    permit: PermitWithRelations,
    actor: AuthenticatedUser,
    payload: { userId: string; email?: string; name?: string; organization?: string },
  ) {
    this.ensureManager(actor)

    const existing = permit.dataHolderAssignments.find(
      (assignment: PermitWithRelations['dataHolderAssignments'][number]) => assignment.userId === payload.userId,
    )
    if (existing) {
      const error = new Error('Data holder already assigned to this permit.')
      ;(error as Error & { statusCode?: number }).statusCode = 409
      throw error
    }

    const created = await prisma.dataHolderAssignment.create({
      data: {
        permitId: permit.id,
        userId: payload.userId,
        email: normalizeEmail(payload.email) ?? null,
        name: payload.name ?? null,
        organization: payload.organization ?? null,
      },
    })

    await PermitService.recordActivity(
      permit.id,
      actor,
      'DATA_HOLDER_ASSIGNED',
      `Assigned data holder ${payload.userId}.`,
      { userId: payload.userId },
    )

    await eventPublisher.publish({
      name: 'data_holder.assigned',
      payload: { permitId: permit.id, userId: payload.userId },
    })

    return created
  },

  async remove(permit: PermitWithRelations, actor: AuthenticatedUser, assignmentId: string) {
    this.ensureManager(actor)

    const assignment = permit.dataHolderAssignments.find(
      (item: PermitWithRelations['dataHolderAssignments'][number]) => item.id === assignmentId,
    )
    if (!assignment) {
      const error = new Error('Data holder not found on this permit.')
      ;(error as Error & { statusCode?: number }).statusCode = 404
      throw error
    }

    await prisma.dataHolderAssignment.delete({ where: { id: assignmentId } })

    await PermitService.recordActivity(
      permit.id,
      actor,
      'DATA_HOLDER_REMOVED',
      `Removed data holder ${assignment.userId}.`,
      { userId: assignment.userId },
    )

    await eventPublisher.publish({
      name: 'data_holder.removed',
      payload: { permitId: permit.id, userId: assignment.userId },
    })
  },
}

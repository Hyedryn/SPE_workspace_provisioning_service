import prisma from '../lib/prisma'
import type { PermitWithRelations } from '../types/database'
import type { AuthenticatedUser } from '../types/user'
import { normalizeEmail } from '../utils/strings'
import { canManageTeam } from '../utils/permitAccess'
import eventPublisher from '../events/eventPublisher'
import { PROJECT_INVESTIGATOR_ROLE } from '../utils/roles'
import { PermitService } from './permitService'

export const TeamService = {
  async inviteTeamMember(
    permit: PermitWithRelations,
    actor: AuthenticatedUser,
    payload: { email: string; name?: string; role?: string; organization?: string },
  ) {
    if (!canManageTeam(permit, actor)) {
      const error = new Error('Forbidden')
      ;(error as Error & { statusCode?: number }).statusCode = 403
      throw error
    }

    const email = normalizeEmail(payload.email)
    if (!email) {
      const error = new Error('A valid email address is required.')
      ;(error as Error & { statusCode?: number }).statusCode = 400
      throw error
    }

    const existing = permit.teamMembers.find(
      (member: PermitWithRelations['teamMembers'][number]) => normalizeEmail(member.email) === email,
    )
    if (existing) {
      const error = new Error('Collaborator is already on this permit.')
      ;(error as Error & { statusCode?: number }).statusCode = 409
      throw error
    }

    const created = await prisma.teamMember.create({
      data: {
        permitId: permit.id,
        email,
        name: payload.name?.trim() || payload.email.trim(),
        organization: payload.organization?.trim() || null,
        role: payload.role?.trim() || 'PROJECT_MEMBER',
      },
    })

    if (created.role === PROJECT_INVESTIGATOR_ROLE) {
      await prisma.permit.update({
        where: { id: permit.id },
        data: { principalInvestigator: created.name ?? created.email },
      })
    }

    await PermitService.recordActivity(permit.id, actor, 'TEAM_MEMBER_INVITED', `Invited ${email} to permit team.`, undefined, {
      id: created.userId ?? created.id,
      name: created.name,
      email: created.email,
    })

    await eventPublisher.publish({
      name: 'team.member_added',
      payload: {
        permitId: permit.id,
        userId: created.userId,
        email: created.email,
        role: created.role,
      },
    })

    return created
  },

  async removeTeamMember(permit: PermitWithRelations, actor: AuthenticatedUser, memberId: string) {
    if (!canManageTeam(permit, actor)) {
      const error = new Error('Forbidden')
      ;(error as Error & { statusCode?: number }).statusCode = 403
      throw error
    }

    const member = permit.teamMembers.find(
      (candidate: PermitWithRelations['teamMembers'][number]) => candidate.id === memberId,
    )
    if (!member) {
      const error = new Error('Team member not found.')
      ;(error as Error & { statusCode?: number }).statusCode = 404
      throw error
    }

    await prisma.teamMember.delete({ where: { id: memberId } })

    if (member.role === PROJECT_INVESTIGATOR_ROLE) {
      const replacement = await prisma.teamMember.findFirst({
        where: { permitId: permit.id, role: PROJECT_INVESTIGATOR_ROLE },
      })

      await prisma.permit.update({
        where: { id: permit.id },
        data: { principalInvestigator: replacement?.name ?? replacement?.email ?? null },
      })
    }

    await PermitService.recordActivity(
      permit.id,
      actor,
      'TEAM_MEMBER_REMOVED',
      `Removed ${member.email ?? member.name ?? 'collaborator'} from permit team.`,
      undefined,
      {
        id: member.userId ?? member.id,
        name: member.name,
        email: member.email,
      },
    )

    await eventPublisher.publish({
      name: 'team.member_removed',
      payload: {
        permitId: permit.id,
        userId: member.userId,
        email: member.email,
        role: member.role,
      },
    })
  },
}

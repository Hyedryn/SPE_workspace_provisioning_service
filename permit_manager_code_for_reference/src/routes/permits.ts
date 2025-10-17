import type { FastifyPluginAsync } from 'fastify'
import { Type } from '@sinclair/typebox'
import type { PermitWithRelations } from '../types/database'
import { PermitService, reviewTransitions } from '../services/permitService'
import { TeamService } from '../services/teamService'
import { HdabTeamService } from '../services/hdabTeamService'
import { DataHolderService } from '../services/dataHolderService'
import { OutputService } from '../services/outputService'
import { WorkspaceService } from '../services/workspaceService'
import { ActivityLogService } from '../services/activityLogService'
import { buildPermitResponse } from '../transformers/permitTransformer'
import { isHdabPermitManager, isSuperAdmin } from '../utils/authorization'
import { userHasPermitAccess } from '../utils/permitAccess'
import { normalizeEmail } from '../utils/strings'

const permitsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/',
    {
      schema: {
        querystring: Type.Object({
          status: Type.Optional(Type.String()),
        }),
      },
    },
    async (request) => {
      const { status } = request.query as { status?: string }
      const permits = await PermitService.listPermitsForUser(request.user, status)
      return {
        permits: permits.map((permit: PermitWithRelations) => buildPermitResponse(permit, request.user)),
      }
    },
  )

  fastify.get<{ Params: { permitId: string } }>('/:permitId', async (request) => {
    const permit = await PermitService.getPermitForUser(request.params.permitId, request.user)
    return { permit }
  })

  fastify.post<{ Params: { permitId: string } }>('/:permitId/initiate-ingress', async (request) => {
    const permit = await PermitService.getPermitOrThrow(request.params.permitId)

    if (!(isSuperAdmin(request.user) || isHdabPermitManager(request.user))) {
      throw fastify.httpErrors.forbidden()
    }

    if (permit.status !== 'AWAITING_INGRESS') {
      throw fastify.httpErrors.badRequest('Permit is not awaiting ingress.')
    }

    const updated = await PermitService.updateStatus(permit.id, 'INGRESS_IN_PROGRESS', request.user)
    await PermitService.recordActivity(permit.id, request.user, 'INGRESS_INITIATED', 'Initiated the data ingress workflow.')

    return {
      permit: buildPermitResponse(updated, request.user),
      message: 'Data ingress initiated.',
    }
  })

  fastify.post<{ Params: { permitId: string } }>('/:permitId/confirm-upload', async (request) => {
    const permit = await PermitService.getPermitOrThrow(request.params.permitId)
    const isAssignedHolder = permit.dataHolderAssignments.some(
      (assignment: PermitWithRelations['dataHolderAssignments'][number]) => assignment.userId === request.user.id,
    )

    if (!(isSuperAdmin(request.user) || isHdabPermitManager(request.user) || isAssignedHolder)) {
      throw fastify.httpErrors.forbidden()
    }

    if (permit.status !== 'INGRESS_IN_PROGRESS') {
      throw fastify.httpErrors.badRequest('No ingress upload is currently in progress.')
    }

    const updated = await PermitService.updateStatus(permit.id, 'DATA_PREPARATION_PENDING', request.user)
    await PermitService.recordActivity(
      permit.id,
      request.user,
      'INGRESS_CONFIRMED',
      'Confirmed data ingress upload completion.',
    )

    return {
      permit: buildPermitResponse(updated, request.user),
      message: 'Ingress upload confirmed.',
    }
  })

  fastify.post<{ Params: { permitId: string }; Body: { stage: string; decision: string; comments?: string } }>(
    '/:permitId/review',
    {
      schema: {
        body: Type.Object({
          stage: Type.String(),
          decision: Type.String(),
          comments: Type.Optional(Type.String()),
        }),
      },
    },
    async (request) => {
      const permit = await PermitService.getPermitOrThrow(request.params.permitId)
      const { stage, decision, comments } = request.body

      const stageConfig = reviewTransitions[stage as keyof typeof reviewTransitions]
      if (!stageConfig) {
        throw fastify.httpErrors.badRequest('Invalid review stage provided.')
      }

      const transition = stageConfig[decision as keyof typeof stageConfig]
      if (!transition) {
        throw fastify.httpErrors.badRequest('Unsupported decision for the provided stage.')
      }

      if (!transition.allowed.includes(permit.status)) {
        throw fastify.httpErrors.conflict('Permit is not in a state that allows this action.')
      }

      await PermitService.ensureReviewPermission(permit, request.user, transition.requiredRoles)

      const updated = await PermitService.updateStatus(permit.id, transition.next, request.user, comments)
      await PermitService.recordActivity(
        permit.id,
        request.user,
        'PERMIT_REVIEW_DECISION',
        `Recorded ${decision.toLowerCase()} decision for ${stage.toLowerCase()} stage.`,
        { stage, decision },
      )

      return {
        permit: buildPermitResponse(updated, request.user),
        message: transition.message,
      }
    },
  )

  fastify.post<{ Params: { permitId: string }; Body: { email: string; name?: string; role?: string; organization?: string } }>(
    '/:permitId/team/invite',
    {
      schema: {
        body: Type.Object({
          email: Type.String({ format: 'email' }),
          name: Type.Optional(Type.String()),
          role: Type.Optional(Type.String()),
          organization: Type.Optional(Type.String()),
        }),
      },
    },
    async (request) => {
      const permit = await PermitService.getPermitOrThrow(request.params.permitId)
      const member = await TeamService.inviteTeamMember(permit, request.user, request.body)
      const refreshed = await PermitService.getPermitOrThrow(permit.id)
      return {
        permit: buildPermitResponse(refreshed, request.user),
        message: `Invitation sent to ${normalizeEmail(member.email) ?? member.email}.`,
      }
    },
  )

  fastify.delete<{ Params: { permitId: string; memberId: string } }>(
    '/:permitId/team/:memberId',
    async (request) => {
      const permit = await PermitService.getPermitOrThrow(request.params.permitId)
      await TeamService.removeTeamMember(permit, request.user, request.params.memberId)
      const refreshed = await PermitService.getPermitOrThrow(permit.id)
      return {
        permit: buildPermitResponse(refreshed, request.user),
        message: 'Team member removed from permit.',
      }
    },
  )

  fastify.post<{ Params: { permitId: string }; Body: { userId: string; permitRole: string } }>(
    '/:permitId/hdab-team',
    {
      schema: {
        body: Type.Object({
          userId: Type.String(),
          permitRole: Type.String(),
        }),
      },
    },
    async (request) => {
      const permit = await PermitService.getPermitOrThrow(request.params.permitId)
      await HdabTeamService.assign(permit, request.user, request.body)
      const refreshed = await PermitService.getPermitOrThrow(permit.id)
      return {
        permit: buildPermitResponse(refreshed, request.user),
        message: 'HDAB team member assigned.',
      }
    },
  )

  fastify.delete<{ Params: { permitId: string; userId: string }; Querystring: { permitRole: string } }>(
    '/:permitId/hdab-team/:userId',
    {
      schema: {
        querystring: Type.Object({ permitRole: Type.String() }),
      },
    },
    async (request) => {
      const permit = await PermitService.getPermitOrThrow(request.params.permitId)
      await HdabTeamService.remove(permit, request.user, request.params.userId, request.query.permitRole)
      const refreshed = await PermitService.getPermitOrThrow(permit.id)
      return {
        permit: buildPermitResponse(refreshed, request.user),
        message: 'HDAB team member removed.',
      }
    },
  )

  fastify.post<{ Params: { permitId: string }; Body: { userId: string; email?: string; name?: string; organization?: string } }>(
    '/:permitId/data-holders',
    {
      schema: {
        body: Type.Object({
          userId: Type.String(),
          email: Type.Optional(Type.String({ format: 'email' })),
          name: Type.Optional(Type.String()),
          organization: Type.Optional(Type.String()),
        }),
      },
    },
    async (request) => {
      const permit = await PermitService.getPermitOrThrow(request.params.permitId)
      await DataHolderService.assign(permit, request.user, request.body)
      const refreshed = await PermitService.getPermitOrThrow(permit.id)
      return {
        permit: buildPermitResponse(refreshed, request.user),
        message: 'Data holder assigned.',
      }
    },
  )

  fastify.delete<{ Params: { permitId: string; holderId: string } }>(
    '/:permitId/data-holders/:holderId',
    async (request) => {
      const permit = await PermitService.getPermitOrThrow(request.params.permitId)
      await DataHolderService.remove(permit, request.user, request.params.holderId)
      const refreshed = await PermitService.getPermitOrThrow(permit.id)
      return {
        permit: buildPermitResponse(refreshed, request.user),
        message: 'Data holder removed.',
      }
    },
  )

  fastify.post<{ Params: { permitId: string } }>('/:permitId/workspace/start', async (request) => {
    const permit = await PermitService.getPermitOrThrow(request.params.permitId)
    const state = await WorkspaceService.start(permit, request.user)
    return { status: state.status, message: 'Workspace starting.' }
  })

  fastify.post<{ Params: { permitId: string } }>('/:permitId/workspace/stop', async (request) => {
    const permit = await PermitService.getPermitOrThrow(request.params.permitId)
    const state = await WorkspaceService.stop(permit, request.user)
    return { status: state.status, message: 'Workspace stopped.' }
  })

  fastify.get<{ Params: { permitId: string } }>('/:permitId/workspace/status', async (request) => {
    const permit = await PermitService.getPermitOrThrow(request.params.permitId)

    if (!userHasPermitAccess(permit, request.user)) {
      throw fastify.httpErrors.forbidden()
    }

    return WorkspaceService.getStatus(permit.id)
  })

  fastify.post<{ Params: { permitId: string } }>('/:permitId/workspace/submit-for-review', async (request) => {
    const permit = await PermitService.getPermitOrThrow(request.params.permitId)
    const updated = await WorkspaceService.submitForReview(permit, request.user)
    return {
      permit: buildPermitResponse(updated, request.user),
      message: 'Workspace setup submitted for HDAB review.',
    }
  })

  fastify.get<{ Params: { permitId: string }; Querystring: { reviewerMode?: string } }>(
    '/:permitId/workspace/connection',
    async (request) => {
      const permit = await PermitService.getPermitOrThrow(request.params.permitId)

      if (!userHasPermitAccess(permit, request.user)) {
        throw fastify.httpErrors.forbidden()
      }

      return WorkspaceService.getConnection(permit.id, request.query.reviewerMode)
    },
  )

  fastify.get<{ Params: { permitId: string } }>('/:permitId/workspace/browse', async (request) => {
    const permit = await PermitService.getPermitOrThrow(request.params.permitId)
    return WorkspaceService.browse(permit, request.user)
  })

  fastify.post<{ Params: { permitId: string }; Body: { folderPath: string; description: string } }>(
    '/:permitId/outputs',
    {
      schema: {
        body: Type.Object({
          folderPath: Type.String(),
          description: Type.String(),
        }),
      },
    },
    async (request) => {
      const permit = await PermitService.getPermitOrThrow(request.params.permitId)
      const output = await OutputService.submit(permit, request.user, request.body)
      const refreshed = await PermitService.getPermitOrThrow(permit.id)
      const { summary } = await OutputService.list(permit.id)
      return {
        output,
        permit: buildPermitResponse(refreshed, request.user),
        summary,
        message: 'Output submitted for egress review.',
      }
    },
  )

  fastify.get<{ Params: { permitId: string } }>('/:permitId/outputs', async (request) => {
    const permit = await PermitService.getPermitOrThrow(request.params.permitId)

    if (!userHasPermitAccess(permit, request.user)) {
      throw fastify.httpErrors.forbidden()
    }

    const { outputs, summary } = await OutputService.list(permit.id)
    return { outputs, summary }
  })

  fastify.get<{ Params: { permitId: string; outputId: string } }>(
    '/:permitId/outputs/:outputId',
    async (request) => {
      const permit = await PermitService.getPermitOrThrow(request.params.permitId)

      if (!userHasPermitAccess(permit, request.user)) {
        throw fastify.httpErrors.forbidden()
      }

      const output = await OutputService.getOutput(permit.id, request.params.outputId)
      return { output }
    },
  )

  fastify.post<{ Params: { permitId: string; outputId: string }; Body: { decision: 'APPROVED' | 'REWORK_REQUESTED'; comments?: string } }>(
    '/:permitId/outputs/:outputId/review',
    {
      schema: {
        body: Type.Object({
          decision: Type.Union([Type.Literal('APPROVED'), Type.Literal('REWORK_REQUESTED')]),
          comments: Type.Optional(Type.String()),
        }),
      },
    },
    async (request) => {
      const permit = await PermitService.getPermitOrThrow(request.params.permitId)
      const output = await OutputService.getOutput(permit.id, request.params.outputId)
      const updated = await OutputService.review(permit, request.user, output, request.body.decision, request.body.comments)
      const refreshed = await PermitService.getPermitOrThrow(permit.id)
      const { summary } = await OutputService.list(permit.id)
      return {
        output: updated,
        permit: buildPermitResponse(refreshed, request.user),
        summary,
        message:
          request.body.decision === 'APPROVED'
            ? 'Output approved for egress.'
            : 'Egress rework requested.',
      }
    },
  )

  fastify.get<{ Params: { permitId: string; outputId: string } }>(
    '/:permitId/outputs/:outputId/download-link',
    async (request) => {
      const permit = await PermitService.getPermitOrThrow(request.params.permitId)
      const output = await OutputService.getOutput(permit.id, request.params.outputId)
      return OutputService.generateDownloadLink(permit, request.user, output)
    },
  )

  fastify.get<{ Params: { permitId: string }; Querystring: { limit?: number; offset?: number; since?: string; until?: string; type?: string | string[]; search?: string } }>(
    '/:permitId/activity',
    async (request) => {
      const permit = await PermitService.getPermitOrThrow(request.params.permitId)
      const { limit, offset, since, until, type, search } = request.query
      const types = Array.isArray(type) ? type : type ? [type] : []
      const response = await ActivityLogService.list(permit, request.user, {
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
        since: since ? new Date(since) : null,
        until: until ? new Date(until) : null,
        types,
        search: search ?? null,
      })
      return response
    },
  )
}

export default permitsRoutes

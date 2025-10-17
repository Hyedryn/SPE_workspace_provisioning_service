import prisma from '../lib/prisma'
import type { PermitWithRelations } from '../types/database'
import type { AuthenticatedUser } from '../types/user'
import { isPermitContributor, canReviewOutput, userHasPermitAccess } from '../utils/permitAccess'
import { isSuperAdmin } from '../utils/authorization'
import eventPublisher from '../events/eventPublisher'
import { PermitService } from './permitService'
import type { OutputRecord } from '../types/models'
import { summarizeOutputs } from '../transformers/permitTransformer'

export const OutputService = {
  async submit(
    permit: PermitWithRelations,
    actor: AuthenticatedUser,
    payload: { folderPath: string; description: string },
  ) {
    if (!payload.folderPath) {
      const error = new Error('A folder path is required.')
      ;(error as Error & { statusCode?: number }).statusCode = 400
      throw error
    }

    if (!payload.description || !payload.description.trim()) {
      const error = new Error('A justification describing the egress contents is required.')
      ;(error as Error & { statusCode?: number }).statusCode = 400
      throw error
    }

    if (!(isSuperAdmin(actor) || isPermitContributor(permit, actor))) {
      const error = new Error('Forbidden')
      ;(error as Error & { statusCode?: number }).statusCode = 403
      throw error
    }

    if (permit.status !== 'ANALYSIS_ACTIVE') {
      const error = new Error('Outputs can only be submitted while analysis is in progress.')
      ;(error as Error & { statusCode?: number }).statusCode = 409
      throw error
    }

    const output = await prisma.output.create({
      data: {
        permitId: permit.id,
        folderPath: payload.folderPath,
        description: payload.description.trim(),
        status: 'EGRESS_REVIEW_PENDING',
      },
    })

    await prisma.permit.update({
      where: { id: permit.id },
      data: { updatedAt: new Date() },
    })

    await PermitService.recordActivity(
      permit.id,
      actor,
      'OUTPUT_SUBMITTED',
      `Submitted output folder ${payload.folderPath}.`,
      { folderPath: payload.folderPath, outputId: output.id },
    )

    await eventPublisher.publish({
      name: 'egress.submitted',
      payload: { permitId: permit.id, outputId: output.id, folderPath: output.folderPath },
    })

    return output
  },

  async list(permitId: string): Promise<{ outputs: OutputRecord[]; summary: ReturnType<typeof summarizeOutputs>['summary'] }> {
    const outputs = (await prisma.output.findMany({
      where: { permitId },
      orderBy: { submittedAt: 'desc' },
    })) as OutputRecord[]

    const { summary } = summarizeOutputs(outputs)
    return { outputs, summary }
  },

  async getOutput(permitId: string, outputId: string): Promise<OutputRecord> {
    const output = (await prisma.output.findUnique({
      where: { id: outputId },
    })) as OutputRecord | null

    if (!output || output.permitId !== permitId) {
      const error = new Error('Not found')
      ;(error as Error & { statusCode?: number }).statusCode = 404
      throw error
    }

    return output
  },

  async review(
    permit: PermitWithRelations,
    actor: AuthenticatedUser,
    output: OutputRecord,
    decision: 'APPROVED' | 'REWORK_REQUESTED',
    comments?: string,
  ) {
    if (!canReviewOutput(permit, actor)) {
      const error = new Error('Forbidden')
      ;(error as Error & { statusCode?: number }).statusCode = 403
      throw error
    }

    const status = decision === 'APPROVED' ? 'EGRESS_APPROVED' : 'EGRESS_REWORK'

    const updated = await prisma.output.update({
      where: { id: output.id },
      data: {
        status,
        reviewedAt: new Date(),
        reviewedByUserId: actor.id,
        reviewerComments: comments ?? null,
      },
    })

    await PermitService.recordActivity(
      permit.id,
      actor,
      'OUTPUT_REVIEW_DECISION',
      decision === 'APPROVED'
        ? `Approved output ${output.id} for egress.`
        : `Requested rework for output ${output.id}.`,
      { outputId: output.id, decision },
    )

    if (status === 'EGRESS_APPROVED') {
      await eventPublisher.publish({
        name: 'egress.approved',
        payload: { permitId: permit.id, outputId: output.id },
      })
    }

    return updated
  },

  async generateDownloadLink(
    permit: PermitWithRelations,
    actor: AuthenticatedUser,
    output: OutputRecord,
  ): Promise<{ url: string }> {
    if (!userHasPermitAccess(permit, actor)) {
      const error = new Error('Forbidden')
      ;(error as Error & { statusCode?: number }).statusCode = 403
      throw error
    }

    if (output.status !== 'EGRESS_APPROVED') {
      const error = new Error('Output not approved for download.')
      ;(error as Error & { statusCode?: number }).statusCode = 403
      throw error
    }

    await PermitService.recordActivity(
      permit.id,
      actor,
      'OUTPUT_DOWNLOAD_REQUESTED',
      `Requested download link for output ${output.id}.`,
      { outputId: output.id },
    )

    // In production this would call the egress management service to obtain a signed URL.
    const url = `https://downloads.spe.local/permits/${permit.id}/outputs/${output.id}?token=stub`
    return { url }
  },
}

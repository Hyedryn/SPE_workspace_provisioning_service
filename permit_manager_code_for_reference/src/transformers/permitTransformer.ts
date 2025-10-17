import type { OutputRecord } from '../types/models'
import type { PermitWithRelations } from '../types/database'
import type { AuthenticatedUser } from '../types/user'
import { applyDoubleBlindRedaction } from '../utils/redaction'
import {
  getHdabAssignmentsGrouped,
  getDataHolderAssignments,
  sanitizePermitRole,
} from '../utils/permitAccess'

export type PermitResponse = {
  id: string
  reference: string
  projectTitle: string
  principalInvestigator?: string | null
  dataset?: string | null
  status: string
  description?: string | null
  createdAt: string
  updatedAt: string
  team: TeamMemberResponse[]
  assignedHdabTeam: HdabTeamResponse[]
  dataHolders: DataHolderResponse[]
  egressSummary: EgressSummary
}

export type TeamMemberResponse = {
  id: string
  userId: string | null
  name: string | null
  role: string
  email: string | null
  organization: string | null
}

export type HdabTeamResponse = {
  userId: string
  permitRoles: string[]
}

export type DataHolderResponse = {
  id: string
  userId: string
  name: string | null
  email: string | null
  organization: string | null
}

export type EgressSummary = {
  total: number
  pending: number
  changesRequested: number
  approved: number
  latestSubmittedAt?: string
  latestStatus?: string
  latestFolderPath?: string
  needsAttention: number
}

export const summarizeOutputs = (outputs: OutputRecord[]): { outputs: OutputRecord[]; summary: EgressSummary } => {
  const sorted = [...outputs].sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
  )

  const summary = sorted.reduce(
    (accumulator, output) => {
      if (output.status === 'EGRESS_REVIEW_PENDING') {
        accumulator.pending += 1
      } else if (output.status === 'EGRESS_REWORK') {
        accumulator.changesRequested += 1
      } else if (output.status === 'EGRESS_APPROVED') {
        accumulator.approved += 1
      }
      return accumulator
    },
    { total: sorted.length, pending: 0, changesRequested: 0, approved: 0, needsAttention: 0 } as EgressSummary,
  )

  if (sorted.length > 0) {
    summary.latestSubmittedAt = sorted[0].submittedAt.toISOString()
    summary.latestStatus = sorted[0].status
    summary.latestFolderPath = sorted[0].folderPath
  }

  summary.needsAttention = summary.pending + summary.changesRequested

  return { outputs: sorted, summary }
}

const mapTeamMembers = (permit: PermitWithRelations): TeamMemberResponse[] =>
  permit.teamMembers.map((member: PermitWithRelations['teamMembers'][number]) => ({
    id: member.id,
    userId: member.userId ?? null,
    name: member.name ?? null,
    role: member.role,
    email: member.email ?? null,
    organization: member.organization ?? null,
  }))

const mapHdabTeam = (permit: PermitWithRelations): HdabTeamResponse[] => {
  const grouped = getHdabAssignmentsGrouped(permit)
  return Array.from(grouped.entries()).map(([userId, roles]) => ({
    userId,
    permitRoles: Array.from(roles).map((role) => sanitizePermitRole(role)).filter(Boolean),
  }))
}

const mapDataHolders = (permit: PermitWithRelations): DataHolderResponse[] =>
  getDataHolderAssignments(permit).map((assignment: PermitWithRelations['dataHolderAssignments'][number]) => ({
    id: assignment.id,
    userId: assignment.userId,
    name: assignment.name ?? null,
    email: assignment.email ?? null,
    organization: assignment.organization ?? null,
  }))

export const buildPermitResponse = (
  permit: PermitWithRelations & { outputs?: OutputRecord[] },
  user: AuthenticatedUser | null,
): PermitResponse => {
  const sanitized = applyDoubleBlindRedaction(permit, user)
  const outputs = permit.outputs ?? []
  const { summary } = summarizeOutputs(outputs)

  return {
    id: sanitized.id,
    reference: sanitized.reference,
    projectTitle: sanitized.projectTitle,
    principalInvestigator: sanitized.principalInvestigator ?? null,
    dataset: sanitized.dataset ?? null,
    status: sanitized.status,
    description: sanitized.description ?? null,
    createdAt: sanitized.createdAt.toISOString(),
    updatedAt: sanitized.updatedAt.toISOString(),
    team: mapTeamMembers(sanitized),
    assignedHdabTeam: mapHdabTeam(permit),
    dataHolders: mapDataHolders(permit),
    egressSummary: summary,
  }
}

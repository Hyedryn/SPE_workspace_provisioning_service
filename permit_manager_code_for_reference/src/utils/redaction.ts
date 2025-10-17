import type { PermitWithRelations } from '../types/database'
import type { AuthenticatedUser, ViewerContext } from '../types/user'
import {
  PROJECT_ANONYMOUS_REVIEWER_ROLE,
  PROJECT_INVESTIGATOR_ROLE,
  PROJECT_MEMBER_ROLE,
} from './roles'
import {
  getPermitRole,
  hdabHasPermitAccess,
  isPermitAnonymousReviewer,
  getPermitTeamMember,
} from './permitAccess'

export const createViewerContext = (
  permit: PermitWithRelations,
  user: AuthenticatedUser | null,
): ViewerContext => {
  const viewerRole = getPermitRole(permit, user)
  return {
    viewerRole,
    viewerId: user?.id ?? null,
    viewerHasHdabVisibility: hdabHasPermitAccess(permit, user),
    viewerIsAnonymousReviewer: viewerRole === PROJECT_ANONYMOUS_REVIEWER_ROLE,
    viewerIsProjectTeam: Boolean(viewerRole),
  }
}

export const sanitizeTeamMemberForViewer = (
  member: { userId: string | null; name: string | null; email: string | null; organization?: string | null; role: string },
  context: ViewerContext,
) => {
  if (!member) {
    return member
  }

  const sanitized = { ...member }

  if (context.viewerHasHdabVisibility) {
    return sanitized
  }

  const isViewer = sanitized.userId && sanitized.userId === context.viewerId
  const isPrincipalInvestigator = sanitized.role === PROJECT_INVESTIGATOR_ROLE
  const isProjectMember = sanitized.role === PROJECT_MEMBER_ROLE
  const isAnonymousReviewerMember = sanitized.role === PROJECT_ANONYMOUS_REVIEWER_ROLE

  if (context.viewerIsAnonymousReviewer) {
    const shouldRedactContributor =
      (isPrincipalInvestigator || isProjectMember) && !isViewer

    if (shouldRedactContributor) {
      sanitized.name = isPrincipalInvestigator
        ? 'Redacted Principal Investigator'
        : 'Redacted Project Member'
      sanitized.organization = null
      sanitized.email = null
      return sanitized
    }

    if (isAnonymousReviewerMember && !isViewer) {
      sanitized.name = 'Anonymous Reviewer'
      sanitized.organization = null
      sanitized.email = null
      return sanitized
    }
  }

  if (context.viewerIsProjectTeam && !context.viewerIsAnonymousReviewer) {
    if (isAnonymousReviewerMember && !isViewer) {
      sanitized.name = 'Anonymous Reviewer'
      sanitized.organization = null
      sanitized.email = null
    }
  }

  return sanitized
}

export const applyDoubleBlindRedaction = (
  permit: PermitWithRelations,
  user: AuthenticatedUser | null,
) => {
  const context = createViewerContext(permit, user)
  const redactedPermit: PermitWithRelations & { principalInvestigator?: string | null } = {
    ...permit,
  }

  if (
    context.viewerIsAnonymousReviewer &&
    !context.viewerHasHdabVisibility &&
    permit.principalInvestigator
  ) {
    redactedPermit.principalInvestigator = 'Redacted Principal Investigator'
  }

  redactedPermit.teamMembers = permit.teamMembers.map((member: PermitWithRelations['teamMembers'][number]) =>
    sanitizeTeamMemberForViewer(
      {
        userId: member.userId,
        name: member.name ?? null,
        email: member.email ?? null,
        organization: member.organization ?? null,
        role: member.role,
      },
      context,
    ),
  ) as typeof permit.teamMembers

  return redactedPermit
}

export const sanitizeLogPersonForViewer = (
  person: { id?: string | null; name?: string | null; email?: string | null; organization?: string | null } | null,
  permit: PermitWithRelations,
  context: ViewerContext,
) => {
  if (!person || context.viewerHasHdabVisibility) {
    return person
  }

  const teamMember = getPermitTeamMember(permit, {
    id: person.id ?? '',
    email: person.email ?? '',
    roles: [],
  })

  if (!teamMember) {
    return person
  }

  if (teamMember.userId && teamMember.userId === context.viewerId) {
    return person
  }

  const sanitized = sanitizeTeamMemberForViewer(
    {
      userId: teamMember.userId,
      name: teamMember.name ?? null,
      email: teamMember.email ?? null,
      organization: teamMember.organization ?? null,
      role: teamMember.role,
    },
    context,
  )

  if (
    sanitized.name === teamMember.name &&
    sanitized.email === teamMember.email &&
    sanitized.organization === teamMember.organization
  ) {
    return person
  }

  return {
    ...person,
    name: sanitized.name ?? person.name ?? null,
    email: sanitized.email ?? null,
    ...(person.organization !== undefined
      ? { organization: sanitized.organization ?? null }
      : {}),
  }
}

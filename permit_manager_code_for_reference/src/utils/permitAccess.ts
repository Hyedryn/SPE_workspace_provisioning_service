import type { PermitWithRelations } from '../types/database'
import type { AuthenticatedUser } from '../types/user'
import { normalizeEmail } from './strings'
import {
  DATA_HOLDER_ROLE,
  DATA_HOLDER_GLOBAL_ROLE,
  PROJECT_ANONYMOUS_REVIEWER_ROLE,
  PROJECT_CONTRIBUTOR_ROLES,
  PROJECT_INVESTIGATOR_ROLE,
  HDAB_PERMIT_ROLES,
  HDAB_EGRESS_REVIEWER_ROLE,
} from './roles'
import { hasRole, isSuperAdmin, isHdabPermitManager, isGlobalHdabStaff } from './authorization'

export const getPermitTeamMember = (
  permit: PermitWithRelations,
  user: AuthenticatedUser | null,
) => {
  if (!user) {
    return null
  }
  const normalizedUserEmail = normalizeEmail(user.email)
  return (
    permit.teamMembers.find((member: PermitWithRelations['teamMembers'][number]) => {
      if (!member) {
        return false
      }
      if (member.userId && member.userId === user.id) {
        return true
      }
      const memberEmail = normalizeEmail(member.email)
      return Boolean(normalizedUserEmail && memberEmail && memberEmail === normalizedUserEmail)
    }) ?? null
  )
}

export const getPermitRole = (
  permit: PermitWithRelations,
  user: AuthenticatedUser | null,
): string | null => getPermitTeamMember(permit, user)?.role ?? null

export const isPermitContributor = (
  permit: PermitWithRelations,
  user: AuthenticatedUser | null,
): boolean => {
  const role = getPermitRole(permit, user)
  return role ? PROJECT_CONTRIBUTOR_ROLES.includes(role as typeof PROJECT_CONTRIBUTOR_ROLES[number]) : false
}

export const isPermitInvestigator = (
  permit: PermitWithRelations,
  user: AuthenticatedUser | null,
): boolean => getPermitRole(permit, user) === PROJECT_INVESTIGATOR_ROLE

export const isPermitAnonymousReviewer = (
  permit: PermitWithRelations,
  user: AuthenticatedUser | null,
): boolean => getPermitRole(permit, user) === PROJECT_ANONYMOUS_REVIEWER_ROLE

export const getHdabRolesForUser = (
  permit: PermitWithRelations,
  user: AuthenticatedUser | null,
): string[] => {
  if (!user) {
    return []
  }
  return permit.hdabAssignments
    .filter((assignment: PermitWithRelations['hdabAssignments'][number]) => assignment.userId === user.id)
    .map((assignment: PermitWithRelations['hdabAssignments'][number]) => assignment.permitRole)
}

export const getHdabAssignmentsGrouped = (permit: PermitWithRelations) => {
  const grouped = new Map<string, Set<string>>()
  for (const assignment of permit.hdabAssignments) {
    if (!grouped.has(assignment.userId)) {
      grouped.set(assignment.userId, new Set())
    }
    grouped.get(assignment.userId)?.add(assignment.permitRole)
  }
  return grouped
}

export const getDataHolderAssignments = (permit: PermitWithRelations) => permit.dataHolderAssignments

export const getDataHolderForUser = (
  permit: PermitWithRelations,
  user: AuthenticatedUser | null,
) => {
  if (!user) {
    return null
  }
  const normalizedUserEmail = normalizeEmail(user.email)
  return (
    permit.dataHolderAssignments.find((assignment: PermitWithRelations['dataHolderAssignments'][number]) => {
      if (!assignment) {
        return false
      }
      if (assignment.userId === user.id) {
        return true
      }
      const assignmentEmail = normalizeEmail(assignment.email)
      return Boolean(normalizedUserEmail && assignmentEmail && normalizedUserEmail === assignmentEmail)
    }) ?? null
  )
}

export const isDataHolderForPermit = (
  permit: PermitWithRelations,
  user: AuthenticatedUser | null,
): boolean => {
  if (!user) {
    return false
  }
  if (!hasRole(user, DATA_HOLDER_GLOBAL_ROLE) && !hasRole(user, DATA_HOLDER_ROLE) && !isSuperAdmin(user)) {
    return false
  }
  return Boolean(getDataHolderForUser(permit, user))
}

export const hdabHasPermitAccess = (
  permit: PermitWithRelations,
  user: AuthenticatedUser | null,
): boolean => {
  if (!permit || !user) {
    return false
  }
  if (isSuperAdmin(user) || isHdabPermitManager(user)) {
    return true
  }
  if (!isGlobalHdabStaff(user)) {
    return false
  }
  return getHdabRolesForUser(permit, user).length > 0
}

export const userHasPermitAccess = (
  permit: PermitWithRelations,
  user: AuthenticatedUser | null,
): boolean => {
  if (!permit || !user) {
    return false
  }
  if (isSuperAdmin(user)) {
    return true
  }
  if (hdabHasPermitAccess(permit, user)) {
    return true
  }
  if (getPermitTeamMember(permit, user)) {
    return true
  }
  return isDataHolderForPermit(permit, user)
}

export const canManageTeam = (
  permit: PermitWithRelations,
  user: AuthenticatedUser | null,
): boolean => isSuperAdmin(user) || isPermitInvestigator(permit, user)

export const canAssignHdabTeam = (user: AuthenticatedUser | null): boolean =>
  isSuperAdmin(user) || isHdabPermitManager(user)

export const canReviewOutput = (
  permit: PermitWithRelations,
  user: AuthenticatedUser | null,
): boolean => {
  if (isSuperAdmin(user)) {
    return true
  }
  const roles = getHdabRolesForUser(permit, user)
  return roles.includes(HDAB_EGRESS_REVIEWER_ROLE)
}

export const sanitizePermitRole = (role: string): string =>
  HDAB_PERMIT_ROLES.includes(role as (typeof HDAB_PERMIT_ROLES)[number]) ? role : ''

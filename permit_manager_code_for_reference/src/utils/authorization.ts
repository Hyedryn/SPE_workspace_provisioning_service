import { AuthenticatedUser } from '../types/user'
import {
  DATA_HOLDER_GLOBAL_ROLE,
  HDAB_PERMIT_MANAGER_ROLE,
  HDAB_PERMIT_ROLES,
  HDAB_STAFF_ROLE,
  PROJECT_ANONYMOUS_REVIEWER_ROLE,
  PROJECT_CONTRIBUTOR_ROLES,
  PROJECT_INVESTIGATOR_ROLE,
  SUPERADMIN_ROLE,
} from './roles'

export const hasRole = (user: AuthenticatedUser | null, role: string): boolean => {
  if (!user) {
    return false
  }
  return user.roles.includes(role)
}

export const hasAnyRole = (user: AuthenticatedUser | null, roles: readonly string[]): boolean => {
  return roles.some((role) => hasRole(user, role))
}

export const isSuperAdmin = (user: AuthenticatedUser | null): boolean =>
  hasRole(user, SUPERADMIN_ROLE)

export const isHdabPermitManager = (user: AuthenticatedUser | null): boolean =>
  isSuperAdmin(user) || hasRole(user, HDAB_PERMIT_MANAGER_ROLE)

export const isGlobalHdabStaff = (user: AuthenticatedUser | null): boolean =>
  isHdabPermitManager(user) || hasRole(user, HDAB_STAFF_ROLE)

export const isProjectInvestigator = (user: AuthenticatedUser | null, role: string | null): boolean =>
  role === PROJECT_INVESTIGATOR_ROLE

export const isProjectContributorRole = (role: string | null): boolean =>
  (role ? PROJECT_CONTRIBUTOR_ROLES.includes(role as typeof PROJECT_CONTRIBUTOR_ROLES[number]) : false)

export const isAnonymousReviewerRole = (role: string | null): boolean =>
  role === PROJECT_ANONYMOUS_REVIEWER_ROLE

export const hasGlobalDataHolderRole = (user: AuthenticatedUser | null): boolean =>
  hasRole(user, DATA_HOLDER_GLOBAL_ROLE)

export const isValidHdabPermitRole = (role: string): boolean =>
  HDAB_PERMIT_ROLES.includes(role as (typeof HDAB_PERMIT_ROLES)[number])

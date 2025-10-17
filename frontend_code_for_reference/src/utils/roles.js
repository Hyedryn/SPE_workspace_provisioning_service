import i18n from '../i18n.js'

export const SUPERADMIN_ROLE = 'SPE_SUPERADMIN'

export const HDAB_STAFF_ROLE = 'HDAB_STAFF'
export const HDAB_PERMIT_MANAGER_ROLE = 'HDAB_PERMIT_MANAGER'

export const HDAB_DATA_PREPARATOR_ROLE = 'HDAB_DATA_PREPARATOR'
export const HDAB_DATA_REVIEWER_ROLE = 'HDAB_DATA_REVIEWER'
export const HDAB_SETUP_ENGINEER_ROLE = 'HDAB_SETUP_ENGINEER'
export const HDAB_SETUP_REVIEWER_ROLE = 'HDAB_SETUP_REVIEWER'
export const HDAB_EGRESS_REVIEWER_ROLE = 'HDAB_EGRESS_REVIEWER'

export const DATA_HOLDER_ROLE = 'DATA_HOLDER'
export const DATA_HOLDER_GLOBAL_ROLE = 'DATA_HOLDER_USER'

export const HDAB_PERMIT_ROLES = [
  HDAB_DATA_PREPARATOR_ROLE,
  HDAB_DATA_REVIEWER_ROLE,
  HDAB_SETUP_ENGINEER_ROLE,
  HDAB_SETUP_REVIEWER_ROLE,
  HDAB_EGRESS_REVIEWER_ROLE,
]

export const HDAB_ROLES = HDAB_PERMIT_ROLES

export const HDAB_GLOBAL_ROLES = [HDAB_STAFF_ROLE, HDAB_PERMIT_MANAGER_ROLE]

export const PROJECT_INVESTIGATOR_ROLE = 'PROJECT_INVESTIGATOR'
export const PROJECT_MEMBER_ROLE = 'PROJECT_MEMBER'
export const PROJECT_ANONYMOUS_REVIEWER_ROLE = 'PROJECT_ANONYMOUS_REVIEWER'

export const PROJECT_ROLES = [
  PROJECT_INVESTIGATOR_ROLE,
  PROJECT_MEMBER_ROLE,
  PROJECT_ANONYMOUS_REVIEWER_ROLE,
]

export const PROJECT_CONTRIBUTOR_ROLES = [
  PROJECT_INVESTIGATOR_ROLE,
  PROJECT_MEMBER_ROLE,
]

const PROJECT_ROLE_TRANSLATION_KEYS = {
  [PROJECT_INVESTIGATOR_ROLE]: 'roles.project.principalInvestigator',
  [PROJECT_MEMBER_ROLE]: 'roles.project.projectMember',
  [PROJECT_ANONYMOUS_REVIEWER_ROLE]: 'roles.project.anonymousReviewer',
}

const HDAB_PERMIT_ROLE_TRANSLATION_KEYS = {
  [HDAB_DATA_PREPARATOR_ROLE]: 'roles.hdab.dataPreparator',
  [HDAB_DATA_REVIEWER_ROLE]: 'roles.hdab.dataReviewer',
  [HDAB_SETUP_ENGINEER_ROLE]: 'roles.hdab.setupEngineer',
  [HDAB_SETUP_REVIEWER_ROLE]: 'roles.hdab.setupReviewer',
  [HDAB_EGRESS_REVIEWER_ROLE]: 'roles.hdab.egressReviewer',
}

export const getProjectRoleTranslationKey = (role) =>
  PROJECT_ROLE_TRANSLATION_KEYS[role] ?? 'roles.project.fallback'

export const getProjectRoleLabel = (role) =>
  i18n.t(getProjectRoleTranslationKey(role), {
    defaultValue: role?.replace(/_/g, ' ') ?? '',
  })

export const getHdabPermitRoleTranslationKey = (role) =>
  HDAB_PERMIT_ROLE_TRANSLATION_KEYS[role] ?? 'roles.hdab.fallback'

export const getHdabPermitRoleLabel = (role) =>
  i18n.t(getHdabPermitRoleTranslationKey(role), {
    defaultValue: role?.replace(/_/g, ' ') ?? '',
  })

export const getDataHolderRoleLabel = () => i18n.t('roles.dataHolder')

export const hasDataHolderGlobalRole = (roles = []) =>
  hasRole(roles, DATA_HOLDER_GLOBAL_ROLE)

export const isProjectInvestigatorRole = (role) => role === PROJECT_INVESTIGATOR_ROLE

export const isProjectContributorRole = (role) =>
  PROJECT_CONTRIBUTOR_ROLES.includes(role)

export const isAnonymousReviewerRole = (role) =>
  role === PROJECT_ANONYMOUS_REVIEWER_ROLE

export const hasRole = (roles = [], role) => roles.includes(role)

export const hasAnyRole = (roles = [], requiredRoles = []) =>
  requiredRoles.some((role) => hasRole(roles, role))

export const hasRoleWithPrefix = (roles = [], prefix) =>
  roles.some((role) => role.startsWith(prefix))

export const isSuperAdmin = (roles = []) => hasRole(roles, SUPERADMIN_ROLE)

export const isHdabPermitManager = (roles = []) =>
  isSuperAdmin(roles) || hasRole(roles, HDAB_PERMIT_MANAGER_ROLE)

export const isHdabStaff = (roles = []) =>
  isSuperAdmin(roles) ||
  hasRole(roles, HDAB_STAFF_ROLE) ||
  hasRole(roles, HDAB_PERMIT_MANAGER_ROLE)

export const isProjectTeamMember = (roles = []) =>
  hasAnyRole(roles, PROJECT_ROLES)

export const matchesRolePattern = (roles = [], pattern) => {
  if (!pattern) {
    return true
  }

  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1)
    return roles.some((role) => role.startsWith(prefix))
  }

  return roles.includes(pattern)
}

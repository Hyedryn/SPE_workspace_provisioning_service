import { useMemo } from 'react'
import { useAppSelector } from './useAppSelector.js'
import { selectCurrentUser } from '../features/auth/authSlice.js'
import {
  DATA_HOLDER_ROLE,
  isAnonymousReviewerRole,
  isHdabPermitManager,
  isHdabStaff,
  isProjectContributorRole,
  isProjectInvestigatorRole,
  isSuperAdmin,
  HDAB_EGRESS_REVIEWER_ROLE,
} from '../utils/roles.js'

const normalizeEmail = (value) => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()

  return trimmedValue ? trimmedValue.toLowerCase() : null
}

const basePermissions = {
  canView: false,
  canManageTeam: false,
  canSubmitOutputs: false,
  canSubmitWorkspace: false,
  canReviewOutputs: false,
  canManagePreparation: false,
  canReviewPreparation: false,
  canManageSetup: false,
  canReviewSetup: false,
  canConfirmIngress: false,
  isAnonymousReviewer: false,
  isTeamMember: false,
  hasPermitAccess: false,
  permitRole: null,
  hdabAccess: false,
  isHdabReviewer: false,
  hdabPermitRoles: [],
  canManageHdabTeam: false,
  canManageDataHolders: false,
  isHdabPermitManager: false,
  isDataHolder: false,
}

export const usePermitPermissions = (permit) => {
  const currentUser = useAppSelector(selectCurrentUser)

  return useMemo(() => {
    const globalRoles = currentUser?.roles ?? []
    const userIsSuperAdmin = isSuperAdmin(globalRoles)
    const userIsHdabManager = isHdabPermitManager(globalRoles)
    const userIsGlobalHdab = isHdabStaff(globalRoles)

    if (!currentUser || !permit) {
      return {
        ...basePermissions,
        isSuperAdmin: userIsSuperAdmin,
        isHdabPermitManager: userIsHdabManager,
        hdabPermitRoles: [],
        globalRoles,
      }
    }

    const hdabAssignments = Array.isArray(permit.assignedHdabTeam)
      ? permit.assignedHdabTeam.filter(
          (assignment) => assignment?.userId === currentUser.id,
        )
      : []

    const hdabPermitRoles = hdabAssignments
      .flatMap((assignment) => {
        if (Array.isArray(assignment?.permitRoles)) {
          return assignment.permitRoles
        }

        return assignment?.permitRole ? [assignment.permitRole] : []
      })
      .filter(Boolean)

    const hasHdabPermitRole = hdabPermitRoles.length > 0

    const hasHdabCapability = (role) =>
      userIsSuperAdmin ||
      (role ? hdabPermitRoles.includes(role) || globalRoles.includes(role) : false)

    const hdabAccess =
      userIsSuperAdmin ||
      userIsHdabManager ||
      (userIsGlobalHdab && hasHdabPermitRole)

    const normalizedUserEmail = normalizeEmail(currentUser.email)
    const dataHolderAssignment = Array.isArray(permit.dataHolders)
      ? permit.dataHolders.find((assignment) => {
          if (!assignment) {
            return false
          }

          if (assignment.userId && assignment.userId === currentUser.id) {
            return true
          }

          if (!normalizedUserEmail) {
            return false
          }

          const assignmentEmail = normalizeEmail(assignment.email)
          return Boolean(assignmentEmail) && assignmentEmail === normalizedUserEmail
        })
      : null

    const membership = permit.team?.find((member) => {
      if (!member) {
        return false
      }

      if (member.userId && currentUser.id && member.userId === currentUser.id) {
        return true
      }

      if (!normalizedUserEmail) {
        return false
      }

      const memberEmail = normalizeEmail(member.email)
      return memberEmail && memberEmail === normalizedUserEmail
    })

    const permitRole = membership?.role ?? null
    const isTeamMember = Boolean(permitRole)
    const isInvestigator = isProjectInvestigatorRole(permitRole)
    const isContributor = isProjectContributorRole(permitRole)
    const isAnonymousReviewer = isAnonymousReviewerRole(permitRole)

    const isDataHolder = Boolean(dataHolderAssignment)

    let canView = userIsSuperAdmin || isTeamMember || hdabAccess
    let canManageTeam = userIsSuperAdmin || isInvestigator
    let canSubmitOutputs = userIsSuperAdmin || isContributor
    const canManageDataHolders = userIsSuperAdmin || userIsHdabManager
    const canManageHdabTeam = userIsSuperAdmin || userIsHdabManager
    const canManagePreparation = hasHdabCapability('HDAB_DATA_PREPARATOR')
    const canReviewPreparation = hasHdabCapability('HDAB_DATA_REVIEWER')
    const canManageSetup = hasHdabCapability('HDAB_SETUP_ENGINEER')
    const canReviewSetup = hasHdabCapability('HDAB_SETUP_REVIEWER')

    if (isDataHolder) {
      canView = true

      if (!userIsSuperAdmin) {
        const hasTeamManagementRole = isInvestigator
        const hasSubmissionRole = isContributor

        if (!hasTeamManagementRole) {
          canManageTeam = false
        }

        if (!hasSubmissionRole) {
          canSubmitOutputs = false
        }
      }
    }

    const canReviewOutputs = hasHdabCapability(HDAB_EGRESS_REVIEWER_ROLE)
    const canConfirmIngress = userIsSuperAdmin || isDataHolder

    return {
      ...basePermissions,
      canView,
      canManageTeam,
      canSubmitOutputs,
      canSubmitWorkspace: canSubmitOutputs,
      canReviewOutputs,
      canManagePreparation,
      canReviewPreparation,
      canManageSetup,
      canReviewSetup,
      canConfirmIngress,
      isAnonymousReviewer,
      isTeamMember,
      hasPermitAccess: canView,
      permitRole,
      hdabAccess,
      isHdabReviewer: hasHdabPermitRole,
      hdabPermitRoles,
      isSuperAdmin: userIsSuperAdmin,
      canManageHdabTeam,
      canManageDataHolders,
      isHdabPermitManager: userIsHdabManager,
      isDataHolder,
      dataHolderRole: dataHolderAssignment?.role ?? DATA_HOLDER_ROLE,
      globalRoles,
    }
  }, [currentUser, permit])
}

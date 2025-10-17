import { useEffect, useMemo } from 'react'
import { Box, Grid, Stack, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useAppDispatch } from '../hooks/useAppDispatch.js'
import { useAppSelector } from '../hooks/useAppSelector.js'
import {
  fetchPermits,
  selectPermitsList,
  selectPermitsStatus,
} from '../features/permits/permitsSlice.js'
import { selectCurrentUser } from '../features/auth/authSlice.js'
import {
  hasDataHolderGlobalRole,
  isHdabPermitManager,
  isHdabStaff,
  isSuperAdmin,
} from '../utils/roles.js'
import HdabActionQueue from '../components/dashboard/HdabActionQueue.jsx'
import ResearcherProjectGrid from '../components/dashboard/ResearcherProjectGrid.jsx'
import LoadingSpinner from '../components/common/LoadingSpinner.jsx'
import ActionLogPanel from '../components/dashboard/ActionLogPanel.jsx'
import DataHolderIngressList from '../components/dashboard/DataHolderIngressList.jsx'
import {
  fetchRecentAuditEntries,
  selectAuditSelectedPermitId,
  selectRecentAuditError,
  selectRecentAuditLogEntries,
  selectRecentAuditStatus,
  setAuditSelectedPermit,
} from '../features/audit/auditSlice.js'

const DashboardPage = () => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const user = useAppSelector(selectCurrentUser)
  const userId = user?.id
  const permits = useAppSelector(selectPermitsList)
  const status = useAppSelector(selectPermitsStatus)
  const auditEntries = useAppSelector(selectRecentAuditLogEntries)
  const auditStatus = useAppSelector(selectRecentAuditStatus)
  const auditError = useAppSelector(selectRecentAuditError)
  const selectedAuditPermitId = useAppSelector(selectAuditSelectedPermitId)

  const roles = useMemo(() => user?.roles ?? [], [user])
  const userIsSuperAdmin = isSuperAdmin(roles)
  const userIsHdabManager = isHdabPermitManager(roles)
  const userIsDataHolder = hasDataHolderGlobalRole(roles)

  const hdabAccessiblePermits = useMemo(() => {
    if (!user || (!isHdabStaff(roles) && !userIsSuperAdmin)) {
      return []
    }

    if (userIsSuperAdmin || userIsHdabManager) {
      return permits
    }

    return permits.filter((permit) =>
      permit.assignedHdabTeam?.some((assignment) => assignment?.userId === user.id),
    )
  }, [permits, roles, user, userIsSuperAdmin, userIsHdabManager])

  const projectAccessiblePermits = useMemo(() => {
    if (!user) {
      return []
    }

    const normalizeEmail = (value) => value?.trim().toLowerCase()
    const userEmail = normalizeEmail(user.email)

    return permits.filter((permit) => {
      if (!Array.isArray(permit.team)) {
        return false
      }

      return permit.team.some((member) => {
        if (member.userId && member.userId === user.id) {
          return true
        }
        const memberEmail = normalizeEmail(member.email)
        return Boolean(memberEmail && memberEmail === userEmail)
      })
    })
  }, [permits, user])

  const dataHolderAccessiblePermits = useMemo(() => {
    if (!user) {
      return []
    }

    const normalizeEmail = (value) => value?.trim().toLowerCase()
    const userEmail = normalizeEmail(user.email)

    return permits.filter((permit) => {
      if (!Array.isArray(permit.dataHolders)) {
        return false
      }

      return permit.dataHolders.some((holder) => {
        if (!holder) {
          return false
        }

        if (holder.userId && holder.userId === user.id) {
          return true
        }

        const holderEmail = normalizeEmail(holder.email)
        return Boolean(holderEmail) && holderEmail === userEmail
      })
    })
  }, [permits, user])

  const accessiblePermits = useMemo(() => {
    const combined = new Map()
    hdabAccessiblePermits.forEach((permit) => combined.set(permit.id, permit))
    projectAccessiblePermits.forEach((permit) => combined.set(permit.id, permit))
    dataHolderAccessiblePermits.forEach((permit) => combined.set(permit.id, permit))
    return Array.from(combined.values())
  }, [
    dataHolderAccessiblePermits,
    hdabAccessiblePermits,
    projectAccessiblePermits,
  ])

  const isProjectUser = projectAccessiblePermits.length > 0
  const hasDataHolderAssignments = dataHolderAccessiblePermits.length > 0

  useEffect(() => {
    dispatch(fetchPermits())
  }, [dispatch])

  useEffect(() => {
    const firstAccessiblePermitId = accessiblePermits[0]?.id ?? null
    const isCurrentAccessible = selectedAuditPermitId
      ? accessiblePermits.some((permit) => permit.id === selectedAuditPermitId)
      : false

    if (!accessiblePermits.length && selectedAuditPermitId) {
      dispatch(setAuditSelectedPermit(null))
      return
    }

    if (!isCurrentAccessible && firstAccessiblePermitId) {
      dispatch(setAuditSelectedPermit(firstAccessiblePermitId))
    }
  }, [accessiblePermits, selectedAuditPermitId, dispatch])

  useEffect(() => {
    if (userId && selectedAuditPermitId) {
      dispatch(fetchRecentAuditEntries())
    }
  }, [dispatch, userId, selectedAuditPermitId])

  const handleRefreshActivity = () => {
    if (selectedAuditPermitId) {
      dispatch(fetchRecentAuditEntries())
    }
  }

  const isHdabUser = isHdabStaff(roles)
  const showRightColumn = isProjectUser || userIsDataHolder
  const showActivityLog = isHdabUser || isProjectUser || hasDataHolderAssignments
  const activityScope = isHdabUser
    ? 'hdab'
    : isProjectUser
      ? 'member'
      : 'dataHolder'

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        {t('dashboard.title', {
          name: user?.fullName ?? t('common.userFallback'),
        })}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        {t('dashboard.subtitle')}
      </Typography>

      {status === 'loading' && (
        <LoadingSpinner label={t('dashboard.loading')} />
      )}

      <Grid container spacing={3}>
        {isHdabUser && (
          <Grid item xs={12} lg={showRightColumn ? 8 : 12}>
            <HdabActionQueue permits={hdabAccessiblePermits} />
          </Grid>
        )}

        {showRightColumn && (
          <Grid item xs={12} lg={isHdabUser ? 4 : 12}>
            <Stack spacing={3}>
              {isProjectUser && (
                <ResearcherProjectGrid permits={accessiblePermits} />
              )}
              {userIsDataHolder && (
                <DataHolderIngressList permits={dataHolderAccessiblePermits} />
              )}
            </Stack>
          </Grid>
        )}

        {!isHdabUser && !showRightColumn && userIsDataHolder && (
          <Grid item xs={12}>
            <DataHolderIngressList permits={dataHolderAccessiblePermits} />
          </Grid>
        )}

        {showActivityLog && (
          <Grid item xs={12}>
            <ActionLogPanel
              actions={auditEntries}
              status={auditStatus}
              error={auditError}
              scope={activityScope}
              permitOptions={accessiblePermits}
              selectedPermitId={selectedAuditPermitId}
              onSelectPermit={(permitId) => dispatch(setAuditSelectedPermit(permitId))}
              onRefresh={handleRefreshActivity}
              viewAllTo={
                selectedAuditPermitId && (isHdabUser || isProjectUser)
                  ? `/activity-log?permit=${encodeURIComponent(selectedAuditPermitId)}`
                  : null
              }
            />
          </Grid>
        )}
      </Grid>
    </Box>
  )
}

export default DashboardPage

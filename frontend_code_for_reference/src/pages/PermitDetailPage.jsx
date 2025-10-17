import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Box, Grid, Paper, Stack, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useAppDispatch } from '../hooks/useAppDispatch.js'
import { useAppSelector } from '../hooks/useAppSelector.js'
import {
  fetchPermitById,
  selectPermitDetail,
  selectPermitsStatus,
} from '../features/permits/permitsSlice.js'
import LoadingSpinner from '../components/common/LoadingSpinner.jsx'
import PermitHeader from '../components/permits/PermitHeader.jsx'
import PermitActionPanel from '../components/permits/PermitActionPanel.jsx'
import PermitTeamList from '../components/permits/PermitTeamList.jsx'
import PermitOutputsPanel from '../components/permits/PermitOutputsPanel.jsx'
import HdabOutputsReviewPanel from '../components/permits/HdabOutputsReviewPanel.jsx'
import { usePermitPermissions } from '../hooks/usePermitPermissions.js'
import PermitHdabTeamList from '../components/permits/PermitHdabTeamList.jsx'
import HdabTeamManagementDialog from '../components/permits/HdabTeamManagementDialog.jsx'
import DataHolderActionPanel from '../components/permits/DataHolderActionPanel.jsx'

const PermitDetailPage = ({ scope = 'hdab' }) => {
  const { permitId } = useParams()
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const permit = useAppSelector(selectPermitDetail)
  const status = useAppSelector(selectPermitsStatus)
  const isLoadedPermit = permit?.id === permitId
  const currentPermit = isLoadedPermit ? permit : null
  const permissions = usePermitPermissions(currentPermit)
  const [hdabDialogOpen, setHdabDialogOpen] = useState(false)
  const isHdabEgressReviewer = permissions.canReviewOutputs
  const isAnonymousReviewerOnly =
    permissions.isAnonymousReviewer && !permissions.canSubmitOutputs

  useEffect(() => {
    if (permitId) {
      dispatch(fetchPermitById(permitId))
    }
  }, [dispatch, permitId])

  if (status === 'loading' && !isLoadedPermit) {
    return <LoadingSpinner label={t('permits.detail.loading')} />
  }

  if (!currentPermit) {
    return <Typography>{t('permits.detail.notFound')}</Typography>
  }

  if (!permissions.hasPermitAccess) {
    return <Navigate to="/403" replace />
  }

  const effectiveScope = permissions.isDataHolder ? 'dataHolder' : scope

  if (permissions.isDataHolder) {
    return (
      <>
        <PermitHeader permit={currentPermit} />
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Stack spacing={3}>
              <Box>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {t('permits.detail.summaryTitle')}
                </Typography>
                <Typography color="text.secondary">
                  {currentPermit.description}
                </Typography>
              </Box>
              <DataHolderActionPanel permit={currentPermit} />
            </Stack>
          </Grid>
          <Grid item xs={12} md={4}>
            <Stack spacing={3}>
              <Paper elevation={0} sx={{ p: 3 }}>
                <Stack spacing={1}>
                  <Typography variant="h6">
                    {t('permits.detail.dataHolder.overviewTitle')}
                  </Typography>
                  <Typography color="text.secondary">
                    {t('permits.detail.dataHolder.overviewDescription')}
                  </Typography>
                  <Typography variant="body2">
                    <strong>{t('permits.detail.dataHolder.datasetLabel')}</strong>{' '}
                    {currentPermit.dataset}
                  </Typography>
                  <Typography variant="body2">
                    <strong>{t('permits.detail.dataHolder.referenceLabel')}</strong>{' '}
                    {currentPermit.reference}
                  </Typography>
                  <Typography variant="body2">
                    <strong>{t('permits.detail.dataHolder.updatedLabel')}</strong>{' '}
                    {new Date(currentPermit.updatedAt).toLocaleString()}
                  </Typography>
                </Stack>
              </Paper>
              <PermitTeamList team={currentPermit.team} />
            </Stack>
          </Grid>
        </Grid>
      </>
    )
  }

  return (
    <>
      <PermitHeader permit={currentPermit} />
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h6" sx={{ mb: 1 }}>
                {t('permits.detail.summaryTitle')}
              </Typography>
              <Typography color="text.secondary">
                {currentPermit.description}
              </Typography>
            </Box>
            <PermitActionPanel
              permit={currentPermit}
              scope={effectiveScope}
            />
            {scope === 'hdab' && isHdabEgressReviewer && (
              <HdabOutputsReviewPanel
                permitId={currentPermit.id}
                summary={currentPermit.egressSummary}
                canReview={isHdabEgressReviewer}
              />
            )}
            {scope === 'member' && (
              <PermitOutputsPanel
                permitId={currentPermit.id}
                summary={currentPermit.egressSummary}
                restrictToApproved={isAnonymousReviewerOnly}
              />
            )}
          </Stack>
        </Grid>
        <Grid item xs={12} md={4}>
          <Stack spacing={3}>
            <PermitTeamList team={currentPermit.team} />
            <PermitHdabTeamList
              assignments={currentPermit.assignedHdabTeam}
              canManage={scope === 'hdab' && permissions.canManageHdabTeam}
              onManageClick={() => setHdabDialogOpen(true)}
            />
          </Stack>
        </Grid>
      </Grid>
      {scope === 'hdab' && permissions.canManageHdabTeam && (
        <HdabTeamManagementDialog
          open={hdabDialogOpen}
          onClose={() => setHdabDialogOpen(false)}
          permit={currentPermit}
        />
      )}
    </>
  )
}

PermitDetailPage.propTypes = {
  scope: PropTypes.oneOf(['hdab', 'member', 'dataHolder']),
}

export default PermitDetailPage

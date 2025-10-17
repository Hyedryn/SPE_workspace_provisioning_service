import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { Navigate, useParams } from 'react-router-dom'
import { Alert, Box, Grid, Paper, Snackbar, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import WorkspaceHeader from '../components/workspace/WorkspaceHeader.jsx'
import GuacamoleClient from '../components/workspace/GuacamoleClient.jsx'
import {
  getWorkspaceConnection,
  getWorkspaceStatus,
  startWorkspace,
  stopWorkspace,
} from '../api/workspaceApi.js'
import { useAppDispatch } from '../hooks/useAppDispatch.js'
import { useAppSelector } from '../hooks/useAppSelector.js'
import {
  fetchPermitById,
  selectPermitDetail,
  selectPermitsError,
  selectPermitsStatus,
} from '../features/permits/permitsSlice.js'
import LoadingSpinner from '../components/common/LoadingSpinner.jsx'
import { usePermitPermissions } from '../hooks/usePermitPermissions.js'

const WorkspacePage = ({ scope = 'hdab' }) => {
  const { permitId, type = 'analysis' } = useParams()
  const dispatch = useAppDispatch()
  const { t } = useTranslation()
  const permit = useAppSelector(selectPermitDetail)
  const permitsStatus = useAppSelector(selectPermitsStatus)
  const permitsError = useAppSelector(selectPermitsError)
  const isLoadedPermit = permit?.id === permitId
  const permissions = usePermitPermissions(isLoadedPermit ? permit : null)
  const [status, setStatus] = useState('STOPPED')
  const [lastUpdated, setLastUpdated] = useState(new Date().toISOString())
  const [connection, setConnection] = useState(null)
  const [busy, setBusy] = useState(false)
  const [snackbar, setSnackbar] = useState(null)
  const pollTimerRef = useRef(null)
  const reviewerMode = permissions.isAnonymousReviewer
    ? 'ANONYMOUS_REVIEW'
    : undefined

  useEffect(() => {
    if (permitId && !isLoadedPermit) {
      dispatch(fetchPermitById(permitId))
    }
  }, [dispatch, permitId, isLoadedPermit])

  const workspaceLabel = useMemo(
    () =>
      t(`workspace.labels.${type}`, {
        defaultValue: t('workspace.labels.default'),
      }),
    [t, type],
  )

  const loadStatus = useCallback(async () => {
    try {
      const data = await getWorkspaceStatus(permitId)
      setStatus(data.status)
      setLastUpdated(new Date().toISOString())
    } catch (error) {
      const message =
        error.response?.data?.message ?? t('workspace.errors.status')
      setSnackbar({ severity: 'error', message })
    }
  }, [permitId, t])

  const loadConnection = useCallback(
    async (notifyIfMissing = false) => {
      try {
        const data = await getWorkspaceConnection(permitId, type, {
          reviewerMode,
        })
        setConnection(data.connection)
      } catch (error) {
        const message =
          error.response?.data?.message ??
          t('workspace.errors.connectionPending')
        if (notifyIfMissing) {
          setSnackbar({ severity: 'warning', message })
        }
      }
    },
    [permitId, type, reviewerMode, t],
  )

  useEffect(() => {
    if (!permissions.hasPermitAccess) {
      return
    }

    loadStatus()
    loadConnection(false)
  }, [permissions.hasPermitAccess, loadStatus, loadConnection])

  useEffect(() => {
    if (!permissions.hasPermitAccess) {
      return
    }

    if (status === 'STARTING') {
      pollTimerRef.current = setInterval(() => {
        loadStatus()
        loadConnection(false)
      }, 2000)
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [status, permissions.hasPermitAccess, loadStatus, loadConnection])

  useEffect(() => {
    if (status !== 'STARTING' && pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [status])

  useEffect(() => {
    if (!permissions.hasPermitAccess) {
      return
    }

    if (status === 'RUNNING' && !connection) {
      loadConnection(true)
    }
  }, [permissions.hasPermitAccess, status, connection, loadConnection])

  const handleStart = async () => {
    setBusy(true)
    try {
      await startWorkspace(permitId)
      setSnackbar({
        severity: 'info',
        message: t('workspace.notifications.startInitiated'),
      })
      await loadStatus()
      await loadConnection(true)
    } catch (error) {
      const message =
        error.response?.data?.message ?? t('workspace.errors.start')
      setSnackbar({ severity: 'error', message })
    } finally {
      setBusy(false)
    }
  }

  const handleStop = async () => {
    setBusy(true)
    try {
      await stopWorkspace(permitId)
      setSnackbar({
        severity: 'info',
        message: t('workspace.notifications.stopInitiated'),
      })
      await loadStatus()
      setConnection(null)
    } catch (error) {
      const message =
        error.response?.data?.message ?? t('workspace.errors.stop')
      setSnackbar({ severity: 'error', message })
    } finally {
      setBusy(false)
    }
  }

  if (!isLoadedPermit) {
    if (permitsStatus === 'loading') {
      return <LoadingSpinner label={t('workspace.loadingAccess')} />
    }

    if (permitsError) {
      return <Alert severity="error">{permitsError}</Alert>
    }

    return <Alert severity="info">{t('workspace.notFound')}</Alert>
  }

  if (!permissions.hasPermitAccess) {
    return <Navigate to="/403" replace />
  }

  if (scope === 'member' && !permissions.canSubmitWorkspace) {
    return <Navigate to="/403" replace />
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        {workspaceLabel}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {`${t('workspace.description')} ${
          scope === 'hdab'
            ? t('workspace.roleDescriptions.hdab')
            : t('workspace.roleDescriptions.member')
        }`}
      </Typography>

      <WorkspaceHeader
        status={status}
        lastUpdated={lastUpdated}
        onStart={handleStart}
        onStop={handleStop}
        disabled={busy}
      />

      {scope === 'hdab' && (
        <Alert severity="info" sx={{ mb: 3 }}>
          {t('workspace.hdabBanner')}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper elevation={0} sx={{ p: 3, height: '100%' }}>
            <GuacamoleClient connection={connection} />
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="h6">{t('workspace.utilities.title')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('workspace.utilities.description')}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Snackbar
        open={Boolean(snackbar)}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snackbar ? (
          <Alert
            onClose={() => setSnackbar(null)}
            severity={snackbar.severity}
            variant="filled"
          >
            {snackbar.message}
          </Alert>
        ) : null}
      </Snackbar>
    </Box>
  )
}

WorkspacePage.propTypes = {
  scope: PropTypes.oneOf(['hdab', 'member']),
}

export default WorkspacePage

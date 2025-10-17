import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton,
  useMediaQuery,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import { Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppDispatch } from '../hooks/useAppDispatch.js'
import { useAppSelector } from '../hooks/useAppSelector.js'
import {
  fetchPermitById,
  inviteTeamMember,
  removeTeamMember,
  selectPermitDetail,
  selectPermitsError,
  selectPermitsStatus,
} from '../features/permits/permitsSlice.js'
import { usePermitPermissions } from '../hooks/usePermitPermissions.js'
import LoadingSpinner from '../components/common/LoadingSpinner.jsx'
import { getProjectRoleLabel } from '../utils/roles.js'
import { useTheme } from '@mui/material/styles'

const TeamManagementPage = () => {
  const { permitId } = useParams()
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const permit = useAppSelector(selectPermitDetail)
  const status = useAppSelector(selectPermitsStatus)
  const error = useAppSelector(selectPermitsError)
  const isLoadedPermit = permit?.id === permitId
  const permissions = usePermitPermissions(isLoadedPermit ? permit : null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [alert, setAlert] = useState(null)
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  useEffect(() => {
    dispatch(fetchPermitById(permitId))
  }, [dispatch, permitId])

  useEffect(() => {
    if (error) {
      setAlert({ severity: 'error', message: error })
    }
  }, [error])

  const handleInvite = async () => {
    if (!inviteEmail) return
    try {
      const result = await dispatch(
        inviteTeamMember({ permitId, email: inviteEmail }),
      ).unwrap()
      setAlert({
        severity: 'success',
        message:
          result.message ??
          t('teamManagement.inviteSuccess', { email: inviteEmail }),
      })
      setInviteEmail('')
      setInviteOpen(false)
    } catch (errorMessage) {
      setAlert({ severity: 'error', message: errorMessage })
    }
  }

  const handleRemove = async (memberId) => {
    try {
      const result = await dispatch(
        removeTeamMember({ permitId, memberId }),
      ).unwrap()
      setAlert({
        severity: 'success',
        message:
          result.message ?? t('teamManagement.removeSuccess'),
      })
    } catch (errorMessage) {
      setAlert({ severity: 'error', message: errorMessage })
    }
  }

  if (!isLoadedPermit) {
    if (status === 'loading') {
      return <LoadingSpinner label={t('teamManagement.loading')} />
    }

    if (error) {
      return <Alert severity="error">{error}</Alert>
    }

    return <Alert severity="info">{t('teamManagement.loadingMessage')}</Alert>
  }

  if (!permissions.canManageTeam) {
    return <Navigate to="/403" replace />
  }

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        {t('teamManagement.title')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t('teamManagement.subtitle')}
      </Typography>

      {alert && (
        <Alert
          severity={alert.severity}
          sx={{ mb: 2 }}
          onClose={() => setAlert(null)}
        >
          {alert.message}
        </Alert>
      )}

      <Stack spacing={2}>
        <Button variant="contained" onClick={() => setInviteOpen(true)}>
          {t('teamManagement.inviteButton')}
        </Button>

        <List>
          {permit.team?.map((member) => (
            <ListItem
              key={member.id}
              secondaryAction={
                <IconButton
                  edge="end"
                  aria-label={t('teamManagement.removeAriaLabel')}
                  onClick={() => handleRemove(member.id)}
                  disabled={status === 'loading'}
                >
                  <DeleteIcon />
                </IconButton>
              }
            >
              <ListItemText
                primary={`${member.name}${t('common.separator')}${getProjectRoleLabel(member.role)}`}
                secondary={member.organization}
              />
            </ListItem>
          ))}
        </List>
      </Stack>

      <Dialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        fullScreen={isMobile}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{t('teamManagement.dialog.title')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t('teamManagement.dialog.emailLabel')}
            type="email"
            fullWidth
            variant="standard"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInviteOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleInvite}
            disabled={!inviteEmail || status === 'loading'}
          >
            {t('teamManagement.dialog.submit')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default TeamManagementPage

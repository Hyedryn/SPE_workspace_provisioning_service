import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Autocomplete,
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
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import { Navigate, useParams } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { useAppDispatch } from '../hooks/useAppDispatch.js'
import { useAppSelector } from '../hooks/useAppSelector.js'
import {
  fetchPermitById,
  selectPermitDetail,
  selectPermitsError,
  selectPermitsStatus,
  assignPermitDataHolder,
  removePermitDataHolder,
} from '../features/permits/permitsSlice.js'
import LoadingSpinner from '../components/common/LoadingSpinner.jsx'
import { usePermitPermissions } from '../hooks/usePermitPermissions.js'
import { searchDataHolders } from '../api/dataHoldersApi.js'

const DataHolderManagementPage = () => {
  const { permitId } = useParams()
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const permit = useAppSelector(selectPermitDetail)
  const status = useAppSelector(selectPermitsStatus)
  const error = useAppSelector(selectPermitsError)
  const isLoadedPermit = permit?.id === permitId
  const permissions = usePermitPermissions(isLoadedPermit ? permit : null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [alert, setAlert] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedHolder, setSelectedHolder] = useState(null)
  const [searchError, setSearchError] = useState(null)

  useEffect(() => {
    dispatch(fetchPermitById(permitId))
  }, [dispatch, permitId])

  useEffect(() => {
    if (error) {
      setAlert({ severity: 'error', message: error })
    }
  }, [error])

  const canManageDataHolders = permissions.canManageDataHolders

  const handleAssign = async () => {
    if (!selectedHolder?.id) {
      return
    }

    try {
      const payload = { userId: selectedHolder.id }
      const result = await dispatch(
        assignPermitDataHolder({ permitId, payload }),
      ).unwrap()
      setAlert({
        severity: 'success',
        message:
          result.message ??
          t('dataHolderManagement.assignSuccess', {
            name: selectedHolder.fullName ?? selectedHolder.email,
          }),
      })
      setSelectedHolder(null)
      setSearchTerm('')
      setSearchResults([])
      setSearchError(null)
      setDialogOpen(false)
    } catch (errorMessage) {
      setAlert({ severity: 'error', message: errorMessage })
    }
  }

  const handleRemove = async (holderId) => {
    try {
      const result = await dispatch(
        removePermitDataHolder({ permitId, holderId }),
      ).unwrap()
      setAlert({
        severity: 'success',
        message:
          result.message ?? t('dataHolderManagement.removeSuccess'),
      })
    } catch (errorMessage) {
      setAlert({ severity: 'error', message: errorMessage })
    }
  }

  const holders = useMemo(() => permit?.dataHolders ?? [], [permit])

  useEffect(() => {
    if (!dialogOpen) {
      setSearchTerm('')
      setSearchResults([])
      setSelectedHolder(null)
      setSearchError(null)
      setSearchLoading(false)
      return
    }
  }, [dialogOpen])

  useEffect(() => {
    let isActive = true

    if (!dialogOpen) {
      return () => {
        isActive = false
      }
    }

    const trimmed = searchTerm.trim()

    if (trimmed.length < 2) {
      setSearchLoading(false)
      setSearchResults([])
      setSearchError(null)
      return () => {
        isActive = false
      }
    }

    setSearchLoading(true)
    const timeoutId = setTimeout(() => {
      void searchDataHolders(trimmed)
        .then((data) => {
          if (!isActive) {
            return
          }
          setSearchResults(data.results ?? [])
          setSearchError(null)
        })
        .catch(() => {
          if (!isActive) {
            return
          }
          setSearchResults([])
          setSearchError(t('dataHolderManagement.dialog.searchError'))
        })
        .finally(() => {
          if (!isActive) {
            return
          }
          setSearchLoading(false)
        })
    }, 300)

    return () => {
      isActive = false
      clearTimeout(timeoutId)
    }
  }, [dialogOpen, searchTerm, t])

  if (!isLoadedPermit) {
    if (status === 'loading') {
      return <LoadingSpinner label={t('dataHolderManagement.loading')} />
    }

    if (error) {
      return <Alert severity="error">{error}</Alert>
    }

    return (
      <Alert severity="info">
        {t('dataHolderManagement.loadingMessage')}
      </Alert>
    )
  }

  if (!canManageDataHolders) {
    return <Navigate to="/403" replace />
  }

  return (
    <Box maxWidth={720}>
      <Typography variant="h4" gutterBottom>
        {t('dataHolderManagement.title')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t('dataHolderManagement.subtitle')}
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
        <Button variant="contained" onClick={() => setDialogOpen(true)}>
          {t('dataHolderManagement.assignButton')}
        </Button>

        <List>
          {holders.length === 0 ? (
            <ListItem>
              <ListItemText primary={t('dataHolderManagement.empty')} />
            </ListItem>
          ) : (
            holders.map((holder) => {
              const displayName = holder.name ?? holder.email
              const separator = t('common.separator')
              const subtitleParts = [holder.organization, holder.email]
                .filter(Boolean)
                .join(separator)
              const key = holder.id ?? holder.userId ?? holder.email
              const removalId = holder.userId ?? holder.id ?? holder.email
              return (
                <ListItem
                  key={key}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      aria-label={t('dataHolderManagement.removeAriaLabel')}
                      onClick={() => handleRemove(removalId)}
                      disabled={status === 'loading'}
                    >
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={displayName}
                    secondary={subtitleParts}
                  />
                </ListItem>
              )
            })
          )}
        </List>
      </Stack>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle>{t('dataHolderManagement.dialog.title')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {searchError && <Alert severity="error">{searchError}</Alert>}
            <Autocomplete
              autoComplete
              autoHighlight
              includeInputInList
              options={searchResults}
              value={selectedHolder}
              loading={searchLoading}
              onChange={(event, value) => setSelectedHolder(value)}
              inputValue={searchTerm}
              onInputChange={(event, value) => setSearchTerm(value)}
              getOptionLabel={(option) =>
                option?.fullName
                  ? `${option.fullName} (${option.email})`
                  : option?.email ?? ''
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  autoFocus
                  label={t('dataHolderManagement.dialog.searchLabel')}
                  placeholder={t('dataHolderManagement.dialog.searchPlaceholder')}
                  helperText={t('dataHolderManagement.dialog.searchHelper')}
                />
              )}
              noOptionsText={
                searchTerm.trim().length < 2
                  ? t('dataHolderManagement.dialog.noInput')
                  : t('dataHolderManagement.dialog.noResults')
              }
            />
            {selectedHolder && (
              <Alert severity="info">
                <Trans
                  i18nKey="dataHolderManagement.dialog.assigning"
                  values={{
                    name: selectedHolder.fullName ?? selectedHolder.email,
                    email: selectedHolder.email,
                    organization:
                      selectedHolder.organization ??
                      t('dataHolderManagement.dialog.unknownOrganization'),
                  }}
                  components={{ strong: <strong /> }}
                />
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedHolder || status === 'loading'}
          >
            {t('dataHolderManagement.dialog.submit')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default DataHolderManagementPage

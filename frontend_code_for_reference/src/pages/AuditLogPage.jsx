import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppDispatch } from '../hooks/useAppDispatch.js'
import { useAppSelector } from '../hooks/useAppSelector.js'
import LoadingSpinner from '../components/common/LoadingSpinner.jsx'
import {
  fetchAuditLogEntries,
  selectAuditSelectedPermitId,
  resetAuditLogFilters,
  selectAuditLogAppliedSince,
  selectAuditLogAvailableTypes,
  selectAuditLogEntries,
  selectAuditLogError,
  selectAuditLogFilters,
  selectAuditLogPagination,
  selectAuditLogStatus,
  setAuditLogPage,
  setAuditLogPageSize,
  setAuditSelectedPermit,
  updateAuditLogFilters,
} from '../features/audit/auditSlice.js'
import { selectCurrentUser } from '../features/auth/authSlice.js'
import { fetchPermits, selectPermitsList } from '../features/permits/permitsSlice.js'
import { isHdabPermitManager, isHdabStaff, isSuperAdmin } from '../utils/roles.js'

const formatActionTypeDefault = (type) =>
  type
    ? type
        .toLowerCase()
        .split('_')
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ')
    : 'Action'

const formatActionType = (type, t) =>
  type
    ? t(`auditLog.actionTypes.${type}`, {
        defaultValue: formatActionTypeDefault(type),
      })
    : t('auditLog.typeFallback')

const formatTimestamp = (value) => {
  try {
    return new Date(value).toLocaleString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return value
  }
}

const dateRangeOptions = [
  { value: '7d', labelKey: '7d' },
  { value: '30d', labelKey: '30d' },
  { value: '90d', labelKey: '90d' },
  { value: '180d', labelKey: '180d' },
  { value: 'all', labelKey: 'all' },
]

const AuditLogPage = () => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const [searchParams, setSearchParams] = useSearchParams()
  const user = useAppSelector(selectCurrentUser)
  const userId = user?.id
  const permits = useAppSelector(selectPermitsList)
  const entries = useAppSelector(selectAuditLogEntries)
  const status = useAppSelector(selectAuditLogStatus)
  const error = useAppSelector(selectAuditLogError)
  const filters = useAppSelector(selectAuditLogFilters)
  const pagination = useAppSelector(selectAuditLogPagination)
  const availableTypes = useAppSelector(selectAuditLogAvailableTypes)
  const appliedSince = useAppSelector(selectAuditLogAppliedSince)
  const selectedPermitId = useAppSelector(selectAuditSelectedPermitId)
  const [searchDraft, setSearchDraft] = useState(filters.search)
  const lastAppliedPermitQueryRef = useRef(null)

  useEffect(() => {
    setSearchDraft(filters.search)
  }, [filters.search])

  useEffect(() => {
    dispatch(fetchPermits())
  }, [dispatch])

  const roles = useMemo(() => user?.roles ?? [], [user])
  const userIsSuperAdmin = isSuperAdmin(roles)
  const userIsHdabManager = isHdabPermitManager(roles)

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

  const accessiblePermits = useMemo(() => {
    const combined = new Map()
    hdabAccessiblePermits.forEach((permit) => combined.set(permit.id, permit))
    projectAccessiblePermits.forEach((permit) => combined.set(permit.id, permit))
    return Array.from(combined.values())
  }, [hdabAccessiblePermits, projectAccessiblePermits])

  const permitQuery = searchParams.get('permit') ?? null

  useEffect(() => {
    if (!selectedPermitId) {
      if (!permitQuery) {
        lastAppliedPermitQueryRef.current = null
        return
      }

      if (lastAppliedPermitQueryRef.current === null) {
        return
      }

      const next = new URLSearchParams(searchParams)
      next.delete('permit')
      setSearchParams(next, { replace: true })
      return
    }

    if (selectedPermitId === permitQuery) {
      return
    }

    const next = new URLSearchParams(searchParams)
    next.set('permit', selectedPermitId)
    setSearchParams(next, { replace: true })
  }, [selectedPermitId, permitQuery, searchParams, setSearchParams])

  useEffect(() => {
    if (!accessiblePermits.length) {
      lastAppliedPermitQueryRef.current = null
      if (selectedPermitId !== null) {
        dispatch(setAuditSelectedPermit(null))
      }
      return
    }

    if (permitQuery && permitQuery !== lastAppliedPermitQueryRef.current) {
      const matchedPermit =
        accessiblePermits.find((permit) => permit.id === permitQuery) ?? null

      if (matchedPermit) {
        if (matchedPermit.id !== selectedPermitId) {
          dispatch(setAuditSelectedPermit(matchedPermit.id))
        }
      } else if (selectedPermitId !== null) {
        dispatch(setAuditSelectedPermit(null))
      }

      lastAppliedPermitQueryRef.current = permitQuery
      return
    }

    if (!permitQuery) {
      lastAppliedPermitQueryRef.current = null
    }

    if (
      selectedPermitId &&
      !accessiblePermits.some((permit) => permit.id === selectedPermitId)
    ) {
      dispatch(setAuditSelectedPermit(null))
    }
  }, [accessiblePermits, permitQuery, selectedPermitId, dispatch])

  useEffect(() => {
    if (!userId || !selectedPermitId) {
      return
    }

    dispatch(fetchAuditLogEntries())
  }, [
    dispatch,
    userId,
    selectedPermitId,
    filters.dateRange,
    filters.actionTypes,
    filters.search,
    pagination.page,
    pagination.pageSize,
  ])

  const actionTypeOptions = useMemo(() => {
    if (!availableTypes?.length) {
      return []
    }
    return [...availableTypes].sort((a, b) => a.localeCompare(b))
  }, [availableTypes])

  const translatedDateRangeOptions = useMemo(
    () =>
      dateRangeOptions.map((option) => ({
        ...option,
        label: t(`auditLog.filters.dateRangeOptions.${option.labelKey}`),
      })),
    [t],
  )

  const hasPermitAccess = accessiblePermits.length > 0
  const selectedPermit = selectedPermitId
    ? accessiblePermits.find((permit) => permit.id === selectedPermitId) ?? null
    : null
  const canDisplayLog = Boolean(selectedPermit)

  const subtitle = selectedPermit
    ? t('auditLog.subtitleWithReference', {
        reference: selectedPermit.reference,
      })
    : t('auditLog.subtitle')

  const handleDateRangeChange = (event) => {
    dispatch(updateAuditLogFilters({ dateRange: event.target.value }))
  }

  const handleActionTypesChange = (event) => {
    const value = event.target.value
    dispatch(updateAuditLogFilters({ actionTypes: typeof value === 'string' ? value.split(',') : value }))
  }

  const handlePermitChange = (event) => {
    dispatch(setAuditSelectedPermit(event.target.value || null))
  }

  const handleSearchSubmit = (event) => {
    event.preventDefault()
    dispatch(updateAuditLogFilters({ search: searchDraft.trim() }))
  }

  const handleResetFilters = () => {
    setSearchDraft('')
    dispatch(resetAuditLogFilters())
  }

  const handlePageChange = (_event, newPage) => {
    dispatch(setAuditLogPage(newPage + 1))
  }

  const handleRowsPerPageChange = (event) => {
    dispatch(setAuditLogPageSize(parseInt(event.target.value, 10)))
  }

  const renderActionTypeValue = (selected) => {
    if (!selected?.length) {
      return t('auditLog.filters.actionTypesAll')
    }

    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {selected.map((value) => (
          <Chip
            key={value}
            label={formatActionType(value, t)}
            size="small"
          />
        ))}
      </Box>
    )
  }

  const totalCount = canDisplayLog ? pagination.total ?? entries.length : 0
  const isLoading = status === 'loading'

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        {t('auditLog.title')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {subtitle}
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack component="form" spacing={2} onSubmit={handleSearchSubmit}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{ '& > *': { width: { xs: '100%', md: 'auto' } } }}
          >
            <FormControl
              sx={{ minWidth: { md: 240 } }}
              size="small"
              disabled={!hasPermitAccess}
            >
              <InputLabel id="audit-permit-select-label">
                {t('auditLog.filters.permitLabel')}
              </InputLabel>
              <Select
                labelId="audit-permit-select-label"
                label={t('auditLog.filters.permitLabel')}
                value={selectedPermitId ?? ''}
                onChange={handlePermitChange}
                displayEmpty
                renderValue={(value) => {
                  if (!value) {
                    return hasPermitAccess
                      ? t('auditLog.filters.permitPlaceholder')
                      : t('auditLog.filters.noPermits')
                  }
                  const permit = accessiblePermits.find((item) => item.id === value)
                  return (
                    permit?.reference ??
                    permit?.projectTitle ??
                    t('auditLog.filters.permitFallback')
                  )
                }}
              >
                {!hasPermitAccess ? (
                  <MenuItem disabled value="">
                    {t('auditLog.filters.noPermits')}
                  </MenuItem>
                ) : (
                  [
                    <MenuItem key="no-permit-selected" value="">
                      <em>{t('auditLog.filters.noPermitSelected')}</em>
                    </MenuItem>,
                    ...accessiblePermits.map((permit) => (
                      <MenuItem key={permit.id} value={permit.id}>
                        <Stack spacing={0.25}>
                          <Typography variant="body2">
                            {permit.reference ??
                              permit.projectTitle ??
                              t('auditLog.filters.permitFallback')}
                          </Typography>
                          {permit.projectTitle && permit.reference && (
                            <Typography variant="caption" color="text.secondary">
                              {permit.projectTitle}
                            </Typography>
                          )}
                        </Stack>
                      </MenuItem>
                    )),
                  ]
                )}
              </Select>
            </FormControl>

            <FormControl
              sx={{ minWidth: { md: 200 } }}
              size="small"
              disabled={!canDisplayLog}
            >
              <InputLabel id="audit-date-range-label">
                {t('auditLog.filters.dateRange')}
              </InputLabel>
              <Select
                labelId="audit-date-range-label"
                label={t('auditLog.filters.dateRange')}
                value={filters.dateRange}
                onChange={handleDateRangeChange}
              >
                {translatedDateRangeOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl
              sx={{ minWidth: { md: 220 } }}
              size="small"
              disabled={!canDisplayLog}
            >
              <InputLabel id="audit-action-types-label">
                {t('auditLog.filters.actionTypes')}
              </InputLabel>
              <Select
                labelId="audit-action-types-label"
                multiple
                value={filters.actionTypes}
                onChange={handleActionTypesChange}
                input={
                  <OutlinedInput label={t('auditLog.filters.actionTypes')} />
                }
                renderValue={renderActionTypeValue}
              >
                {actionTypeOptions.length === 0 && (
                  <MenuItem disabled value="">
                    {t('auditLog.filters.noActivity')}
                  </MenuItem>
                )}
                {actionTypeOptions.map((type) => (
                  <MenuItem key={type} value={type}>
                    {formatActionType(type, t)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              size="small"
              label={t('auditLog.filters.searchLabel')}
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              sx={{ flexGrow: 1 }}
              disabled={!canDisplayLog}
              fullWidth
            />
          </Stack>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ '& > *': { width: { xs: '100%', sm: 'auto' } } }}
          >
            <Button type="submit" variant="contained" size="small" disabled={!canDisplayLog}>
              {t('auditLog.filters.apply')}
            </Button>
            <Button
              type="button"
              variant="text"
              size="small"
              onClick={handleResetFilters}
              disabled={!canDisplayLog}
            >
              {t('auditLog.filters.reset')}
            </Button>
            {appliedSince && canDisplayLog && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ alignSelf: 'center', flexGrow: 1 }}
              >
                {t('auditLog.filters.showingSince', {
                  date: new Date(appliedSince).toLocaleDateString(),
                })}
              </Typography>
            )}
          </Stack>
        </Stack>
      </Paper>

      {error && status === 'failed' && canDisplayLog ? (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      ) : null}

      <Paper sx={{ p: 2 }}>
        {!hasPermitAccess ? (
          <Typography variant="body2" color="text.secondary">
            {t('auditLog.states.noAccess')}
          </Typography>
        ) : !canDisplayLog ? (
          <Typography variant="body2" color="text.secondary">
            {t('auditLog.states.noPermit')}
          </Typography>
        ) : isLoading && totalCount === 0 ? (
          <LoadingSpinner label={t('auditLog.loading')} />
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width="20%">
                    {t('auditLog.table.timestamp')}
                  </TableCell>
                  <TableCell width="18%">
                    {t('auditLog.table.action')}
                  </TableCell>
                  <TableCell>{t('auditLog.table.description')}</TableCell>
                  <TableCell width="18%">
                    {t('auditLog.table.actor')}
                  </TableCell>
                  <TableCell width="18%">
                    {t('auditLog.table.permit')}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id} hover>
                    <TableCell>{formatTimestamp(entry.timestamp)}</TableCell>
                    <TableCell>{formatActionType(entry.type, t)}</TableCell>
                    <TableCell>{entry.description}</TableCell>
                    <TableCell>
                      {entry.actor?.name ?? t('auditLog.table.systemActor')}
                      {entry.actor?.email ? (
                        <Typography variant="caption" display="block" color="text.secondary">
                          {entry.actor.email}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {entry.permit?.reference ?? t('auditLog.table.noReference')}
                      {entry.permit?.projectTitle ? (
                        <Typography variant="caption" display="block" color="text.secondary">
                          {entry.permit.projectTitle}
                        </Typography>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && entries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <Typography variant="body2" color="text.secondary">
                        {t('auditLog.states.empty')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {isLoading && totalCount > 0 && canDisplayLog && <LinearProgress sx={{ mt: 1 }} />}

        {canDisplayLog && (
          <TablePagination
            component="div"
            count={totalCount}
            page={Math.max(0, pagination.page - 1)}
            onPageChange={handlePageChange}
            rowsPerPage={pagination.pageSize}
            onRowsPerPageChange={handleRowsPerPageChange}
            rowsPerPageOptions={[10, 25, 50]}
          />
        )}
      </Paper>
    </Box>
  )
}

export default AuditLogPage

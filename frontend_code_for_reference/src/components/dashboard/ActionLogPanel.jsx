import PropTypes from 'prop-types'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useTranslation } from 'react-i18next'
import LoadingSpinner from '../common/LoadingSpinner.jsx'

const VISIBLE_ACTION_LIMIT = 12

const formatActionType = (type, t) => {
  if (!type) {
    return t('actionLog.typeFallback')
  }

  const formatted = type
    .toLowerCase()
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')

  return t(`actionLog.types.${type}`, { defaultValue: formatted })
}

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

const ActionLogPanel = ({
  actions,
  status,
  error,
  scope,
  permitOptions,
  selectedPermitId,
  onSelectPermit,
  onRefresh,
  viewAllTo,
}) => {
  const { t } = useTranslation()
  const options = permitOptions ?? []
  const selectedPermit =
    options.find((option) => option.id === selectedPermitId) ?? null
  const hasPermitAccess = options.length > 0
  const hasSelectedPermit = Boolean(selectedPermitId && selectedPermit)
  const visibleActions = hasSelectedPermit
    ? actions.slice(0, VISIBLE_ACTION_LIMIT)
    : []

  let bodyContent

  if (!hasPermitAccess) {
    bodyContent = (
      <Typography variant="body2" color="text.secondary">
        {t('actionLog.states.noPermitAccess')}
      </Typography>
    )
  } else if (!hasSelectedPermit) {
    bodyContent = (
      <Typography variant="body2" color="text.secondary">
        {t('actionLog.states.noPermitSelected')}
      </Typography>
    )
  } else if (status === 'loading' && actions.length === 0) {
    bodyContent = <LoadingSpinner label={t('actionLog.loading')} />
  } else if (status === 'failed') {
    bodyContent = (
      <Alert severity="error">
        {error ?? t('actionLog.errorFallback')}
      </Alert>
    )
  } else if (visibleActions.length === 0) {
    bodyContent = (
      <Typography variant="body2" color="text.secondary">
        {t('actionLog.states.empty')}
      </Typography>
    )
  } else {
    bodyContent = (
      <List disablePadding>
        {visibleActions.map((action, index) => {
          const actorName = action.actor?.name ?? t('actionLog.systemActor')
          const permitReference = action.permit?.reference ?? null

          return (
            <Box key={action.id}>
              <ListItem alignItems="flex-start" disableGutters sx={{ py: 1.5 }}>
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Chip
                        label={formatActionType(action.type, t)}
                        size="small"
                        variant="outlined"
                      />
                      <Typography variant="caption" color="text.secondary">
                        {formatTimestamp(action.timestamp)}
                      </Typography>
                    </Stack>
                  }
                  secondary={
                    <Stack spacing={0.5} sx={{ mt: 1 }}>
                      <Typography variant="body2">
                        {action.description}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {permitReference
                          ? t('actionLog.actorWithPermit', {
                              actor: actorName,
                              permit: permitReference,
                            })
                          : actorName}
                      </Typography>
                    </Stack>
                  }
                />
              </ListItem>
              {index < visibleActions.length - 1 && <Divider component="li" />}
            </Box>
          )
        })}
      </List>
    )
  }

  const helperCopy = t(`actionLog.helper.${scope}`)

  const renderPermitSelector = () => {
    if (!hasPermitAccess) {
      return null
    }

    if (options.length === 1 && selectedPermit) {
      return (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 1 }}
        >
          {t('actionLog.selector.singleLabel', {
            permit:
              selectedPermit.reference ??
              selectedPermit.projectTitle ??
              t('actionLog.selector.fallbackPermit'),
          })}
        </Typography>
      )
    }

    return (
      <FormControl size="small" sx={{ mt: 1, minWidth: 220 }}>
        <InputLabel id="action-log-permit-label">
          {t('actionLog.selector.label')}
        </InputLabel>
        <Select
          labelId="action-log-permit-label"
          label={t('actionLog.selector.label')}
          value={selectedPermitId ?? ''}
          onChange={(event) => onSelectPermit?.(event.target.value || null)}
          displayEmpty
          renderValue={(value) => {
            if (!value) {
              return t('actionLog.selector.placeholder')
            }
            const permit = options.find((option) => option.id === value)
            return (
              permit?.reference ??
              permit?.projectTitle ??
              t('actionLog.selector.fallbackPermit')
            )
          }}
        >
          <MenuItem disabled value="">
            {t('actionLog.selector.placeholder')}
          </MenuItem>
          {options.map((permit) => (
            <MenuItem key={permit.id} value={permit.id}>
              <Stack spacing={0.25}>
                <Typography variant="body2">
                  {permit.reference ??
                    permit.projectTitle ??
                    t('actionLog.selector.fallbackPermit')}
                </Typography>
                {permit.projectTitle && permit.reference && (
                  <Typography variant="caption" color="text.secondary">
                    {permit.projectTitle}
                  </Typography>
                )}
              </Stack>
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    )
  }

  return (
    <Paper elevation={0} sx={{ p: 3 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
      >
        <Box>
          <Typography variant="h6">{t('actionLog.title')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {helperCopy}
          </Typography>
          {renderPermitSelector()}
        </Box>
        <Button
          size="small"
          variant="text"
          startIcon={<RefreshIcon />}
          onClick={onRefresh}
          disabled={status === 'loading' || !hasSelectedPermit}
        >
          {t('actionLog.actions.refresh')}
        </Button>
      </Stack>

      <Box sx={{ mt: 2 }}>{bodyContent}</Box>
      {viewAllTo && hasSelectedPermit && visibleActions.length > 0 && (
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            component={RouterLink}
            to={viewAllTo}
            size="small"
            variant="outlined"
          >
            {t('actionLog.actions.viewAll')}
          </Button>
        </Box>
      )}
    </Paper>
  )
}

ActionLogPanel.propTypes = {
  actions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      type: PropTypes.string,
      description: PropTypes.string,
      timestamp: PropTypes.string,
      actor: PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        email: PropTypes.string,
      }),
      permit: PropTypes.shape({
        id: PropTypes.string,
        reference: PropTypes.string,
      }),
    }),
  ),
  status: PropTypes.string,
  error: PropTypes.string,
  scope: PropTypes.oneOf(['hdab', 'member', 'dataHolder']).isRequired,
  permitOptions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      reference: PropTypes.string,
      projectTitle: PropTypes.string,
    }),
  ),
  selectedPermitId: PropTypes.string,
  onSelectPermit: PropTypes.func,
  onRefresh: PropTypes.func.isRequired,
  viewAllTo: PropTypes.string,
}

ActionLogPanel.defaultProps = {
  actions: [],
  status: 'idle',
  error: null,
  permitOptions: [],
  selectedPermitId: null,
  onSelectPermit: null,
  viewAllTo: null,
}

export default ActionLogPanel


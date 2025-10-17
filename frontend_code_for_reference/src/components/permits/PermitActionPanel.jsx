import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppDispatch } from '../../hooks/useAppDispatch.js'
import { useAppSelector } from '../../hooks/useAppSelector.js'
import {
  selectPermitsStatus,
  submitSetupForReview,
  updatePermitStatus,
  initiatePermitIngress,
  confirmPermitIngressUpload,
} from '../../features/permits/permitsSlice.js'
import { usePermitPermissions } from '../../hooks/usePermitPermissions.js'

const displayConditionResolvers = {
  noChangesRequested: (permit) =>
    (permit?.egressSummary?.changesRequested ?? 0) === 0,
  hasChangesRequested: (permit) =>
    (permit?.egressSummary?.changesRequested ?? 0) > 0,
  hasPendingOutputs: (permit) =>
    (permit?.egressSummary?.pending ?? 0) > 0,
  hasApprovedOutputs: (permit) =>
    (permit?.egressSummary?.approved ?? 0) > 0,
}

const alternateLabelResolvers = {
  hasPendingOutputs: (permit, alternateLabel, fallbackLabel) =>
    (permit?.egressSummary?.pending ?? 0) > 0 ? alternateLabel : fallbackLabel,
}

const buildActionLabel = (actionConfig, permit) => {
  const { alternateLabel, alternateLabelCondition } = actionConfig

  if (!alternateLabel) {
    return actionConfig.label
  }

  if (!alternateLabelCondition) {
    return alternateLabel
  }

  const resolver = alternateLabelResolvers[alternateLabelCondition]
  if (!resolver) {
    return actionConfig.label
  }

  return resolver(permit, alternateLabel, actionConfig.label)
}

const PermitActionPanel = ({ permit, scope }) => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { permitId } = useParams()
  const status = useAppSelector(selectPermitsStatus)
  const permissions = usePermitPermissions(permit)
  const [note, setNote] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [actionError, setActionError] = useState('')

  const actionContent = t('permitActions', { returnObjects: true }) ?? {}

  const headings = actionContent.headings ?? {}
  const commentsCopy = actionContent.comments ?? {}
  const fallbackInfoMessages = actionContent.fallbackInfoMessages ?? {}
  const infoMessages = actionContent.infoMessages ?? {}
  const defaultSuccessMessages = actionContent.defaultSuccessMessages ?? {}
  const defaultErrorMessages = actionContent.defaultErrorMessages ?? {}
  const hdabActionsByStatus = actionContent.hdabActionsByStatus ?? {}
  const memberActionsByStatus = actionContent.memberActionsByStatus ?? {}
  const dataHolderActionsByStatus = actionContent.dataHolderActionsByStatus ?? {}
  const fallbackActions = actionContent.fallbackActions ?? {}

  useEffect(() => {
    setNote('')
    setSuccessMessage('')
    setActionError('')
  }, [permit?.status, scope, t])

  if (!permit) {
    return null
  }

  const meetsRequirements = (requires) => {
    if (!requires) {
      return true
    }

    if (Array.isArray(requires)) {
      return requires.some((flag) => Boolean(permissions?.[flag]))
    }

    return Boolean(permissions?.[requires])
  }

  const shouldDisplayAction = (actionConfig) => {
    const condition = actionConfig.displayCondition
    if (!condition) {
      return true
    }

    const resolver = displayConditionResolvers[condition]
    if (!resolver) {
      return true
    }

    return resolver(permit)
  }

  const buildActions = (actionConfigs = []) =>
    (actionConfigs ?? [])
      .map((config) => ({ ...config }))
      .filter((config) => meetsRequirements(config.requires) && shouldDisplayAction(config))
      .map((config) => {
        const action = { ...config }
        action.label = buildActionLabel(action, permit)

        if (action.pathTemplate) {
          action.to = action.pathTemplate.replace(':permitId', permitId)
        }

        delete action.alternateLabel
        delete action.alternateLabelCondition
        delete action.displayCondition
        delete action.pathTemplate

        return action
      })

  let actions
  if (scope === 'member') {
    actions = buildActions(
      memberActionsByStatus[permit.status] ?? fallbackActions.member,
    )
  } else if (scope === 'dataHolder') {
    actions = buildActions(
      dataHolderActionsByStatus[permit.status] ?? fallbackActions.dataHolder,
    )
  } else {
    actions = buildActions(
      hdabActionsByStatus[permit.status] ?? fallbackActions.hdab,
    )
  }

  const infoMessage =
    infoMessages?.[scope]?.[permit.status] ??
    (actions.length === 0 ? fallbackInfoMessages?.[scope] : null)

  const shouldShowNoteField =
    scope === 'hdab' &&
    actions.some(
      (action) => action.type === 'decision' && action.requiresComments,
    )
  const commentsRequired = shouldShowNoteField

  const handleDecision = async (action) => {
    setSuccessMessage('')
    setActionError('')

    const payload = {
      stage: action.stage,
      decision: action.decision,
    }

    if (note.trim()) {
      payload.comments = note.trim()
    }

    const resultAction = await dispatch(
      updatePermitStatus({ permitId: permit.id, payload }),
    )

    if (updatePermitStatus.fulfilled.match(resultAction)) {
      setSuccessMessage(
        action.successMessage ?? defaultSuccessMessages.decision,
      )
    } else if (updatePermitStatus.rejected.match(resultAction)) {
      setActionError(
        resultAction.payload ?? defaultErrorMessages.decision,
      )
    }
  }

  const handleSubmitSetup = async (action) => {
    setSuccessMessage('')
    setActionError('')

    const resultAction = await dispatch(submitSetupForReview(permit.id))

    if (submitSetupForReview.fulfilled.match(resultAction)) {
      setSuccessMessage(
        action.successMessage ?? defaultSuccessMessages.submitSetup,
      )
    } else if (submitSetupForReview.rejected.match(resultAction)) {
      setActionError(
        resultAction.payload ?? defaultErrorMessages.submitSetup,
      )
    }
  }

  const handleCustomAction = async (action) => {
    setSuccessMessage('')
    setActionError('')

    if (action.actionName === 'INITIATE_INGRESS') {
      const resultAction = await dispatch(initiatePermitIngress(permit.id))

      if (initiatePermitIngress.fulfilled.match(resultAction)) {
        setSuccessMessage(
          action.successMessage ?? defaultSuccessMessages.initiateIngress,
        )
      } else if (initiatePermitIngress.rejected.match(resultAction)) {
        setActionError(
          resultAction.payload ?? defaultErrorMessages.initiateIngress,
        )
      }
      return
    }

    if (action.actionName === 'CONFIRM_UPLOAD') {
      const resultAction = await dispatch(confirmPermitIngressUpload(permit.id))

      if (confirmPermitIngressUpload.fulfilled.match(resultAction)) {
        setSuccessMessage(
          action.successMessage ?? defaultSuccessMessages.confirmIngress,
        )
      } else if (confirmPermitIngressUpload.rejected.match(resultAction)) {
        setActionError(
          resultAction.payload ?? defaultErrorMessages.confirmIngress,
        )
      }
      return
    }

    if (typeof action.onClick === 'function') {
      action.onClick()
    }
  }

  const executeAction = (action) => {
    if (action.type === 'navigate') {
      navigate(action.to)
      return
    }

    if (action.type === 'decision') {
      handleDecision(action)
      return
    }

    if (action.type === 'submitSetup') {
      handleSubmitSetup(action)
      return
    }

    if (action.type === 'custom') {
      void handleCustomAction(action)
      return
    }

    if (typeof action.onClick === 'function') {
      action.onClick()
    }
  }

  const headingCopy = headings[scope] ?? {}

  return (
    <Paper elevation={0} sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6">{headingCopy.title ?? ''}</Typography>
          <Typography color="text.secondary">
            {headingCopy.description ?? ''}
          </Typography>
        </Box>

        {shouldShowNoteField && (
          <TextField
            label={
              commentsRequired
                ? commentsCopy.requiredLabel ?? ''
                : commentsCopy.optionalLabel ?? ''
            }
            multiline
            minRows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={commentsCopy.placeholder ?? ''}
            required={commentsRequired}
            fullWidth
          />
        )}

        {actionError && (
          <Alert severity="error" onClose={() => setActionError('')}>
            {actionError}
          </Alert>
        )}

        {successMessage && (
          <Alert severity="success" onClose={() => setSuccessMessage('')}>
            {successMessage}
          </Alert>
        )}

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ '& > *': { width: { xs: '100%', sm: 'auto' } } }}
        >
          {actions.map((action) => (
            <Button
              key={`${action.type}-${action.label}`}
              variant={action.variant}
              color={action.color}
              onClick={() => executeAction(action)}
              disabled={
                status === 'loading' ||
                action.disabled ||
                (action.requiresComments && !note.trim())
              }
            >
              {action.label}
            </Button>
          ))}
        </Stack>

        {infoMessage && <Alert severity="info">{infoMessage}</Alert>}
      </Stack>
    </Paper>
  )
}

PermitActionPanel.propTypes = {
  permit: PropTypes.shape({
    id: PropTypes.string.isRequired,
    status: PropTypes.string,
  }),
  scope: PropTypes.oneOf(['hdab', 'member', 'dataHolder']),
}

PermitActionPanel.defaultProps = {
  scope: 'hdab',
}

export default PermitActionPanel

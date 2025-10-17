import { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import StatusBadge from '../common/StatusBadge.jsx'
import { useAppDispatch } from '../../hooks/useAppDispatch.js'
import { useAppSelector } from '../../hooks/useAppSelector.js'
import {
  fetchPermitOutputs,
  selectOutputsByPermit,
  selectOutputsErrorByPermit,
  selectOutputsStatusByPermit,
  selectOutputsSummaryByPermit,
} from '../../features/outputs/outputsSlice.js'
import { submitOutputReview } from '../../api/outputsApi.js'
import { fetchPermitById } from '../../features/permits/permitsSlice.js'
import { useTranslation } from 'react-i18next'

const statusPriority = {
  EGRESS_REWORK: 0,
  EGRESS_REVIEW_PENDING: 1,
  EGRESS_APPROVED: 2,
}

const outputStatusColors = {
  EGRESS_REWORK: 'error',
  EGRESS_REVIEW_PENDING: 'warning',
  EGRESS_APPROVED: 'success',
}

const formatDateTime = (value) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

const HdabOutputsReviewPanel = ({ permitId, summary, canReview = false }) => {
  const dispatch = useAppDispatch()
  const { t } = useTranslation()
  const outputs = useAppSelector((state) =>
    selectOutputsByPermit(state, permitId),
  )
  const outputsStatus = useAppSelector((state) =>
    selectOutputsStatusByPermit(state, permitId),
  )
  const outputsError = useAppSelector((state) =>
    selectOutputsErrorByPermit(state, permitId),
  )
  const storedSummary = useAppSelector((state) =>
    selectOutputsSummaryByPermit(state, permitId),
  )

  const [selectedOutputId, setSelectedOutputId] = useState(null)
  const [reviewComments, setReviewComments] = useState('')
  const [reviewError, setReviewError] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [panelMessage, setPanelMessage] = useState(null)

  const reviewPanelCopy =
    t('permits.outputs.reviewPanel', { returnObjects: true }) ?? {}
  const errorCopy = reviewPanelCopy.errors ?? {}
  const successCopy = reviewPanelCopy.success ?? {}
  const commentsCopy = reviewPanelCopy.comments ?? {}
  const dialogCopy = reviewPanelCopy.dialog ?? {}

  useEffect(() => {
    if (permitId) {
      dispatch(fetchPermitOutputs(permitId))
    }
  }, [dispatch, permitId])

  useEffect(() => {
    if (!selectedOutputId) {
      setReviewComments('')
      setReviewError('')
      setReviewBusy(false)
    }
  }, [selectedOutputId])

  const selectedOutput = useMemo(
    () => outputs.find((output) => output.id === selectedOutputId) ?? null,
    [outputs, selectedOutputId],
  )

  useEffect(() => {
    if (selectedOutputId && !selectedOutput) {
      setSelectedOutputId(null)
    }
  }, [selectedOutputId, selectedOutput])

  const sortedOutputs = useMemo(() => {
    if (!outputs?.length) return []

    return [...outputs].sort((a, b) => {
      const priorityA = statusPriority[a.status] ?? 99
      const priorityB = statusPriority[b.status] ?? 99

      if (priorityA !== priorityB) {
        return priorityA - priorityB
      }

      return (
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      )
    })
  }, [outputs])

  const fallbackSummary = storedSummary ?? summary ?? null

  const pendingCount = sortedOutputs.length
    ? sortedOutputs.filter((output) => output.status === 'EGRESS_REVIEW_PENDING')
        .length
    : fallbackSummary?.pending ?? 0

  const changesRequestedCount = sortedOutputs.length
    ? sortedOutputs.filter((output) => output.status === 'EGRESS_REWORK').length
        .length
    : fallbackSummary?.changesRequested ?? 0

  const approvedCount = sortedOutputs.length
    ? sortedOutputs.filter((output) => output.status === 'EGRESS_APPROVED').length
    : fallbackSummary?.approved ?? 0

  const isLoading = outputsStatus === 'loading'
  const hasOutputs = sortedOutputs.length > 0

  const reviewableStatuses = new Set(['EGRESS_REVIEW_PENDING'])
  const hasPendingReviews = pendingCount > 0

  const handleDecision = async (decision) => {
    if (!selectedOutput) return

    if (!canReview) {
      setReviewError(errorCopy.noPermission ?? '')
      return
    }

    if (!hasPendingReviews) {
      setReviewError(errorCopy.noPending ?? '')
      return
    }

    const trimmedComments = reviewComments.trim()

    if (decision === 'REWORK_REQUESTED' && !trimmedComments) {
      setReviewError(errorCopy.commentsRequired ?? '')
      return
    }

    setReviewBusy(true)
    setReviewError('')

    try {
      const response = await submitOutputReview(
        permitId,
        selectedOutput.id,
        {
          decision,
          comments: trimmedComments || undefined,
        },
      )

      setPanelMessage({
        severity: 'success',
        text:
          response.message ??
          (decision === 'APPROVED'
            ? successCopy.approved ?? ''
            : successCopy.rework ?? ''),
      })

      setSelectedOutputId(null)
      setReviewComments('')

      await dispatch(fetchPermitOutputs(permitId))
      await dispatch(fetchPermitById(permitId))
    } catch (error) {
      const message =
        error.response?.data?.message ??
        errorCopy.submit ?? ''
      setReviewError(message)
    } finally {
      setReviewBusy(false)
    }
  }

  return (
    <Card id="egress-review" variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6">
              {reviewPanelCopy.title ?? ''}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {reviewPanelCopy.description ?? ''}
            </Typography>
          </Box>

          {panelMessage && (
            <Alert
              severity={panelMessage.severity}
              onClose={() => setPanelMessage(null)}
            >
              {panelMessage.text}
            </Alert>
          )}

          {isLoading && (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                {reviewPanelCopy.loading ?? ''}
              </Typography>
            </Stack>
          )}

          {outputsError && (
            <Alert severity="error">{outputsError}</Alert>
          )}

          {!canReview && (
            <Alert severity="info">
              {reviewPanelCopy.readOnly ?? ''}
            </Alert>
          )}

          {canReview && !hasPendingReviews && (
            <Alert severity="info">
              {reviewPanelCopy.noPendingInfo ?? ''}
            </Alert>
          )}

          {changesRequestedCount > 0 && (
            <Alert severity="warning">
              {t('permits.outputs.reviewPanel.alerts.changesRequested', {
                count: changesRequestedCount,
              })}
            </Alert>
          )}

          {pendingCount > 0 && (
            <Alert severity="info">
              {t('permits.outputs.reviewPanel.alerts.pending', {
                count: pendingCount,
              })}
            </Alert>
          )}

          {!isLoading && !hasOutputs && !outputsError && (
            <Typography variant="body2" color="text.secondary">
              {reviewPanelCopy.empty ?? ''}
            </Typography>
          )}

          {hasOutputs && (
            <Stack spacing={2} divider={<Divider flexItem />} sx={{ mt: 1 }}>
              {sortedOutputs.map((output) => {
                const reviewedLabel =
                  output.status === 'EGRESS_APPROVED'
                    ? t('permits.outputs.reviewed.approved')
                    : t('permits.outputs.reviewed.lastReviewed')

                return (
                  <Stack key={output.id} spacing={0.75}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography
                        variant="subtitle2"
                        sx={{ wordBreak: 'break-all', flexGrow: 1 }}
                      >
                        {output.folderPath}
                      </Typography>
                      <StatusBadge
                        status={output.status}
                        colorOverrides={outputStatusColors}
                      />
                    </Stack>

                    {output.description && (
                      <Typography variant="body2" color="text.secondary">
                        {t('permits.outputs.reviewPanel.justification', {
                          description: output.description,
                        })}
                      </Typography>
                    )}

                    <Typography variant="caption" color="text.secondary">
                      {t('permits.outputs.submittedOn', {
                        date: formatDateTime(output.submittedAt),
                      })}
                    </Typography>

                    {output.reviewedAt && (
                      <Typography variant="caption" color="text.secondary">
                        {t('permits.outputs.reviewedAt', {
                          label: reviewedLabel,
                          date: formatDateTime(output.reviewedAt),
                        })}
                      </Typography>
                    )}

                    {reviewableStatuses.has(output.status) && (
                      <Box sx={{ mt: 1 }}>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => setSelectedOutputId(output.id)}
                          disabled={!canReview || !hasPendingReviews || reviewBusy}
                        >
                          {reviewPanelCopy.reviewButton ?? ''}
                        </Button>
                      </Box>
                    )}
                  </Stack>
                )
              })}
            </Stack>
          )}

          {(hasOutputs || pendingCount + changesRequestedCount + approvedCount > 0) && (
            <Typography variant="caption" color="text.secondary">
              {t('permits.outputs.reviewPanel.summary', {
                approved: approvedCount,
                pending: pendingCount,
                changesRequested: changesRequestedCount,
              })}
            </Typography>
          )}
        </Stack>
      </CardContent>

      <Dialog
        open={Boolean(selectedOutput)}
        onClose={() => setSelectedOutputId(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{dialogCopy.title ?? ''}</DialogTitle>
        <DialogContent dividers>
          {selectedOutput && (
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  {dialogCopy.folderPath ?? ''}
                </Typography>
                <Typography sx={{ wordBreak: 'break-all' }}>
                  {selectedOutput.folderPath}
                </Typography>
              </Box>

              {selectedOutput.description && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    {dialogCopy.justification ?? ''}
                  </Typography>
                  <Typography sx={{ whiteSpace: 'pre-wrap' }}>
                    {selectedOutput.description}
                  </Typography>
                </Box>
              )}

              <Typography variant="body2" color="text.secondary">
                {t('permits.outputs.submittedOn', {
                  date: formatDateTime(selectedOutput.submittedAt),
                })}
              </Typography>

              {selectedOutput.reviewedAt && (
                <Typography variant="body2" color="text.secondary">
                  {t('permits.outputs.reviewedAt', {
                    label: t('permits.outputs.reviewed.lastReviewed'),
                    date: formatDateTime(selectedOutput.reviewedAt),
                  })}
                </Typography>
              )}

              <TextField
                label={commentsCopy.label ?? ''}
                multiline
                minRows={3}
                value={reviewComments}
                onChange={(event) => setReviewComments(event.target.value)}
                placeholder={commentsCopy.placeholder ?? ''}
                helperText={commentsCopy.helper ?? ''}
              />

              {reviewError && <Alert severity="error">{reviewError}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setSelectedOutputId(null)}
            disabled={reviewBusy}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => handleDecision('REWORK_REQUESTED')}
            color="warning"
            disabled={reviewBusy || !canReview || !hasPendingReviews}
          >
            {reviewPanelCopy.requestRework ?? ''}
          </Button>
          <Button
            onClick={() => handleDecision('APPROVED')}
            variant="contained"
            disabled={reviewBusy || !canReview || !hasPendingReviews}
          >
            {reviewBusy
              ? reviewPanelCopy.submitting ?? ''
              : reviewPanelCopy.approve ?? ''}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  )
}

HdabOutputsReviewPanel.propTypes = {
  permitId: PropTypes.string.isRequired,
  summary: PropTypes.shape({
    pending: PropTypes.number,
    changesRequested: PropTypes.number,
    approved: PropTypes.number,
  }),
  canReview: PropTypes.bool,
}

export default HdabOutputsReviewPanel

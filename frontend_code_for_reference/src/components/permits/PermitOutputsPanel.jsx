import { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Button,
  Stack,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useAppDispatch } from '../../hooks/useAppDispatch.js'
import { useAppSelector } from '../../hooks/useAppSelector.js'
import {
  fetchPermitOutputs,
  selectOutputsByPermit,
  selectOutputsErrorByPermit,
  selectOutputsStatusByPermit,
  selectOutputsSummaryByPermit,
} from '../../features/outputs/outputsSlice.js'
import StatusBadge from '../common/StatusBadge.jsx'
import { getOutputDownloadLink } from '../../api/outputsApi.js'

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

const PermitOutputsPanel = ({ permitId, summary, restrictToApproved = false }) => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const outputs = useAppSelector((state) => selectOutputsByPermit(state, permitId))
  const outputsStatus = useAppSelector((state) =>
    selectOutputsStatusByPermit(state, permitId),
  )
  const outputsError = useAppSelector((state) =>
    selectOutputsErrorByPermit(state, permitId),
  )
  const storedSummary = useAppSelector((state) =>
    selectOutputsSummaryByPermit(state, permitId),
  )
  const [downloadState, setDownloadState] = useState({})

  useEffect(() => {
    if (permitId) {
      dispatch(fetchPermitOutputs(permitId))
    }
  }, [dispatch, permitId])

  const sortedOutputs = useMemo(() => {
    if (!outputs?.length) return []

    return [...outputs].sort((a, b) => {
      const priorityA = statusPriority[a.status] ?? 99
      const priorityB = statusPriority[b.status] ?? 99

      if (priorityA !== priorityB) {
        return priorityA - priorityB
      }

      return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    })
  }, [outputs])

  const fallbackSummary = storedSummary ?? summary ?? null

  const displayOutputs = useMemo(() => {
    if (!restrictToApproved) {
      return sortedOutputs
    }
    return sortedOutputs.filter((output) => output.status === 'EGRESS_APPROVED')
  }, [restrictToApproved, sortedOutputs])

  const pendingCount = restrictToApproved
    ? 0
    : sortedOutputs.length
    ? sortedOutputs.filter((output) => output.status === 'EGRESS_REVIEW_PENDING')
        .length
    : fallbackSummary?.pending ?? 0

  const changesRequestedCount = restrictToApproved
    ? 0
    : sortedOutputs.length
    ? sortedOutputs.filter((output) => output.status === 'EGRESS_REWORK').length
        .length
    : fallbackSummary?.changesRequested ?? 0

  const approvedCount = displayOutputs.length
    ? displayOutputs.length
    : fallbackSummary?.approved ?? 0

  const isLoading = outputsStatus === 'loading'
  const hasOutputs = displayOutputs.length > 0

  const handleDownload = async (output) => {
    setDownloadState((prev) => ({
      ...prev,
      [output.id]: { loading: true, error: null },
    }))

    try {
      const data = await getOutputDownloadLink(permitId, output.id)
      if (data?.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer')
      }

      setDownloadState((prev) => ({
        ...prev,
        [output.id]: { loading: false, error: null },
      }))
    } catch (error) {
      const message =
        error.response?.data?.message ?? t('permits.outputs.download.error')
      setDownloadState((prev) => ({
        ...prev,
        [output.id]: { loading: false, error: message },
      }))
    }
  }

  const summaryLineVisible =
    hasOutputs || pendingCount + changesRequestedCount + approvedCount > 0

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          {outputsStatus === 'loading' && (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ color: 'text.secondary' }}
            >
              <CircularProgress size={18} />
              <Typography variant="body2">
                {t('permits.outputs.loading')}
              </Typography>
            </Stack>
          )}

          {outputsError && <Alert severity="error">{outputsError}</Alert>}

          {!restrictToApproved && changesRequestedCount > 0 && (
            <Alert severity="warning">
              {t('permits.outputs.changesRequested', {
                count: changesRequestedCount,
              })}
            </Alert>
          )}

          {!restrictToApproved && pendingCount > 0 && (
            <Alert severity="info">
              {t('permits.outputs.pending', { count: pendingCount })}
            </Alert>
          )}

          {!isLoading && !hasOutputs && !outputsError && (
            <Typography variant="body2" color="text.secondary">
              {restrictToApproved
                ? t('permits.outputs.emptyApproved')
                : t('permits.outputs.emptyPending')}
            </Typography>
          )}

          {hasOutputs && (
            <Stack spacing={2} divider={<Divider flexItem />} sx={{ mt: 1 }}>
              {displayOutputs.map((output) => {
                const downloadInfo = downloadState[output.id] ?? {
                  loading: false,
                  error: null,
                }
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
                      <StatusBadge status={output.status} colorOverrides={outputStatusColors} />
                    </Stack>

                    {output.description && (
                      <Typography variant="body2" color="text.secondary">
                        {output.description}
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

                    {output.status === 'EGRESS_APPROVED' && (
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleDownload(output)}
                          disabled={downloadInfo.loading}
                        >
                          {downloadInfo.loading
                            ? t('permits.outputs.download.preparing')
                            : t('permits.outputs.download.button')}
                        </Button>
                      </Stack>
                    )}

                    {output.status === 'EGRESS_APPROVED' && downloadInfo.error && (
                      <Typography variant="caption" color="error">
                        {downloadInfo.error}
                      </Typography>
                    )}
                  </Stack>
                )
              })}
            </Stack>
          )}

          {summaryLineVisible && (
            <Typography variant="caption" color="text.secondary">
              {t('permits.outputs.summary', {
                approved: approvedCount,
                pending: pendingCount,
                changesRequested: changesRequestedCount,
              })}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

PermitOutputsPanel.propTypes = {
  permitId: PropTypes.string.isRequired,
  summary: PropTypes.shape({
    approved: PropTypes.number,
    changesRequested: PropTypes.number,
    pending: PropTypes.number,
  }),
  restrictToApproved: PropTypes.bool,
}

PermitOutputsPanel.defaultProps = {
  summary: null,
  restrictToApproved: false,
}

export default PermitOutputsPanel


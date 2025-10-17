import PropTypes from 'prop-types'
import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import StatusBadge from '../common/StatusBadge.jsx'
import ProcessStepper from '../common/ProcessStepper.jsx'

const stepTranslationKeys = [
  'dataIngress',
  'preparation',
  'preparationReview',
  'setup',
  'setupReview',
  'analysis',
  'complete',
]

const PermitHeader = ({ permit }) => {
  const { t } = useTranslation()

  if (!permit) return null

  const stepOrder = stepTranslationKeys.map((key) =>
    t(`permits.header.steps.${key}`),
  )

  const statusToStep = {
    AWAITING_INGRESS: 0,
    INGRESS_IN_PROGRESS: 0,
    DATA_PREPARATION_PENDING: 1,
    DATA_PREPARATION_REWORK: 1,
    DATA_PREPARATION_REVIEW_PENDING: 2,
    WORKSPACE_SETUP_PENDING: 3,
    WORKSPACE_SETUP_REWORK: 3,
    WORKSPACE_SETUP_REVIEW_PENDING: 4,
    ANALYSIS_ACTIVE: 5,
    ANALYSIS_PAUSED: 5,
    ARCHIVED: 6,
  }

  const egressSummary = permit.egressSummary ?? {}
  const pendingEgress = egressSummary.pending ?? 0
  const reworkEgress = egressSummary.changesRequested ?? 0
  const approvedEgress = egressSummary.approved ?? 0

  return (
    <Paper elevation={0} sx={{ p: 3, mb: 3 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h4">{permit.projectTitle}</Typography>
          <Typography color="text.secondary">
            {t('permits.header.reference', { reference: permit.reference })}
          </Typography>
        </Box>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          useFlexGap
          sx={{ flexWrap: 'wrap', rowGap: 1 }}
        >
          <StatusBadge status={permit.status} />
          <Chip
            label={t('permits.header.principalInvestigator', {
              name: permit.principalInvestigator,
            })}
            size="small"
          />
          <Chip label={permit.dataset} size="small" />
          <Chip
            label={t('permits.header.createdOn', {
              date: new Date(permit.createdAt).toLocaleDateString(),
            })}
            size="small"
          />
          {reworkEgress > 0 && (
            <Chip
              label={t('permits.header.egressUpdates', { count: reworkEgress })}
              size="small"
              color="warning"
            />
          )}
          {pendingEgress > 0 && (
            <Chip
              label={t('permits.header.pendingReviews', { count: pendingEgress })}
              size="small"
              color="info"
            />
          )}
          {approvedEgress > 0 && (
            <Chip
              label={t('permits.header.approvedOutputs', {
                count: approvedEgress,
              })}
              size="small"
              color="success"
              variant="outlined"
            />
          )}
        </Stack>
        <ProcessStepper
          steps={stepOrder}
          activeStep={statusToStep[permit.status] ?? 0}
        />
      </Stack>
    </Paper>
  )
}

PermitHeader.propTypes = {
  permit: PropTypes.shape({
    projectTitle: PropTypes.string,
    reference: PropTypes.string,
    status: PropTypes.string,
    principalInvestigator: PropTypes.string,
    dataset: PropTypes.string,
    createdAt: PropTypes.string,
  }),
}

export default PermitHeader

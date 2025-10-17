import PropTypes from 'prop-types'
import { Chip } from '@mui/material'
import { useTranslation } from 'react-i18next'

const statusColors = {
  AWAITING_INGRESS: 'default',
  INGRESS_IN_PROGRESS: 'info',
  DATA_PREPARATION_PENDING: 'info',
  DATA_PREPARATION_REVIEW_PENDING: 'warning',
  DATA_PREPARATION_REWORK: 'error',
  WORKSPACE_SETUP_PENDING: 'info',
  WORKSPACE_SETUP_REVIEW_PENDING: 'warning',
  WORKSPACE_SETUP_REWORK: 'error',
  ANALYSIS_ACTIVE: 'success',
  ANALYSIS_PAUSED: 'default',
  ARCHIVED: 'default',
}

const StatusBadge = ({ status, colorOverrides }) => {
  const { t } = useTranslation()
  const mergedColors = colorOverrides
    ? { ...statusColors, ...colorOverrides }
    : statusColors
  const color = mergedColors[status] ?? 'default'
  const label = status
    ? t(`statuses.${status}`, {
        defaultValue: status.replace(/_/g, ' '),
      })
    : t('statuses.unknown')
  return (
    <Chip
      label={label}
      color={color}
      variant={color === 'default' ? 'outlined' : 'filled'}
      size="small"
      sx={{ textTransform: 'uppercase', fontWeight: 600 }}
    />
  )
}

StatusBadge.propTypes = {
  status: PropTypes.string,
  colorOverrides: PropTypes.objectOf(PropTypes.string),
}

export default StatusBadge

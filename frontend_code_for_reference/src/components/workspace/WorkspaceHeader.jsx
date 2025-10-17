import PropTypes from 'prop-types'
import {
  Box,
  Button,
  Chip,
  Stack,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'

const statusColors = {
  STARTING: 'warning',
  RUNNING: 'success',
  STOPPED: 'default',
}

const WorkspaceHeader = ({
  status,
  onStart,
  onStop,
  lastUpdated,
  disabled,
}) => {
  const { t } = useTranslation()
  const translatedStatus = t(`statuses.${status}`, {
    defaultValue: status?.replace(/_/g, ' ') ?? '',
  })

  return (
    <Box
      sx={{
        mb: 3,
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        gap: 2,
      }}
    >
      <Box>
        <Typography variant="h5">{t('workspace.header.title')}</Typography>
        <Typography color="text.secondary">
          {t('workspace.header.lastUpdated', {
            time: new Date(lastUpdated).toLocaleTimeString(),
          })}
        </Typography>
        <Chip
          label={translatedStatus}
          color={statusColors[status] ?? 'default'}
          size="small"
          sx={{ mt: 1 }}
        />
      </Box>
      <Stack direction="row" spacing={1}>
        <Button
          variant="contained"
          onClick={onStart}
          disabled={disabled || status === 'RUNNING'}
        >
          {t('workspace.header.start')}
        </Button>
        <Button
          variant="outlined"
          color="inherit"
          onClick={onStop}
          disabled={disabled || status === 'STOPPED'}
        >
          {t('workspace.header.stop')}
        </Button>
      </Stack>
    </Box>
  )
}

WorkspaceHeader.propTypes = {
  status: PropTypes.string,
  onStart: PropTypes.func.isRequired,
  onStop: PropTypes.func.isRequired,
  lastUpdated: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
}

export default WorkspaceHeader

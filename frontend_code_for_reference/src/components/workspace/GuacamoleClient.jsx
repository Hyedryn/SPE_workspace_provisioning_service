import PropTypes from 'prop-types'
import { Box, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'

const GuacamoleClient = ({ connection }) => {
  const { t } = useTranslation()

  if (!connection) {
    return (
      <Box
        sx={{
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: 2,
          p: 4,
          textAlign: 'center',
        }}
      >
        <Typography color="text.secondary">
          {t('workspace.guacamole.pendingConnection')}
        </Typography>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        borderRadius: 2,
        bgcolor: 'grey.900',
        color: 'grey.100',
        p: 3,
        fontFamily: 'monospace',
      }}
    >
      <Typography sx={{ mb: 1 }}>
        {t('workspace.guacamole.title')}
      </Typography>
      <Typography variant="body2">
        {t('workspace.guacamole.protocol', { value: connection.protocol })}
      </Typography>
      <Typography variant="body2">
        {t('workspace.guacamole.host', { value: connection.host })}
      </Typography>
      <Typography variant="body2">
        {t('workspace.guacamole.port', { value: connection.port })}
      </Typography>
      <Typography variant="body2">
        {t('workspace.guacamole.tunnelId', { value: connection.tunnelId })}
      </Typography>
    </Box>
  )
}

GuacamoleClient.propTypes = {
  connection: PropTypes.shape({
    protocol: PropTypes.string,
    host: PropTypes.string,
    port: PropTypes.number,
    tunnelId: PropTypes.string,
  }),
}

export default GuacamoleClient

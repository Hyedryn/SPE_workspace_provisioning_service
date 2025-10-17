import { Box, Button, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const AccessDeniedPage = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <Box
      sx={{
        textAlign: 'center',
        py: 8,
      }}
    >
      <Typography variant="h3" gutterBottom>
        {t('errors.accessDenied.title')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t('errors.accessDenied.message')}
      </Typography>
      <Button variant="contained" onClick={() => navigate('/dashboard')}>
        {t('errors.accessDenied.action')}
      </Button>
    </Box>
  )
}

export default AccessDeniedPage

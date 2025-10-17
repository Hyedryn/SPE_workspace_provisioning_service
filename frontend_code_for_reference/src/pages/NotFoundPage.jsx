import { Box, Button, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const NotFoundPage = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <Box sx={{ textAlign: 'center', py: 8 }}>
      <Typography variant="h3" gutterBottom>
        {t('errors.notFound.title')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t('errors.notFound.message')}
      </Typography>
      <Button variant="contained" onClick={() => navigate('/dashboard')}>
        {t('errors.notFound.action')}
      </Button>
    </Box>
  )
}

export default NotFoundPage

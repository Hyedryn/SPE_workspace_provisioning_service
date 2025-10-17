import { useEffect } from 'react'
import { Box, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useAppDispatch } from '../hooks/useAppDispatch.js'
import { useAppSelector } from '../hooks/useAppSelector.js'
import {
  fetchPermits,
  selectPermitsList,
  selectPermitsStatus,
} from '../features/permits/permitsSlice.js'
import ResearcherProjectGrid from '../components/dashboard/ResearcherProjectGrid.jsx'
import LoadingSpinner from '../components/common/LoadingSpinner.jsx'

const MyPermitsPage = () => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const permits = useAppSelector(selectPermitsList)
  const status = useAppSelector(selectPermitsStatus)

  useEffect(() => {
    dispatch(fetchPermits())
  }, [dispatch])

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        {t('myPermits.title')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t('myPermits.subtitle')}
      </Typography>

      {status === 'loading' ? (
        <LoadingSpinner label={t('myPermits.loading')} />
      ) : (
        <ResearcherProjectGrid permits={permits} />
      )}
    </Box>
  )
}

export default MyPermitsPage

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
import LoadingSpinner from '../components/common/LoadingSpinner.jsx'
import DataHolderIngressList from '../components/dashboard/DataHolderIngressList.jsx'

const DataIngressPage = () => {
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
        {t('dataIngress.title')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t('dataIngress.subtitle')}
      </Typography>

      {status === 'loading' ? (
        <LoadingSpinner label={t('dataIngress.loading')} />
      ) : (
        <DataHolderIngressList permits={permits} />
      )}
    </Box>
  )
}

export default DataIngressPage

import { useEffect } from 'react'
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppDispatch } from '../hooks/useAppDispatch.js'
import { useAppSelector } from '../hooks/useAppSelector.js'
import {
  fetchPermits,
  selectPermitsList,
  selectPermitsStatus,
} from '../features/permits/permitsSlice.js'
import LoadingSpinner from '../components/common/LoadingSpinner.jsx'
import StatusBadge from '../components/common/StatusBadge.jsx'

const PermitListPage = () => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const permits = useAppSelector(selectPermitsList)
  const status = useAppSelector(selectPermitsStatus)

  useEffect(() => {
    if (status === 'idle') {
      dispatch(fetchPermits())
    }
  }, [dispatch, status])

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        {t('permits.list.title')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t('permits.list.subtitle')}
      </Typography>

      <Paper variant="outlined">
        {status === 'loading' ? (
          <LoadingSpinner label={t('permits.list.loading')} />
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('permits.list.columns.reference')}</TableCell>
                  <TableCell>{t('permits.list.columns.project')}</TableCell>
                  <TableCell>{t('permits.list.columns.investigator')}</TableCell>
                  <TableCell>{t('permits.list.columns.status')}</TableCell>
                  <TableCell align="right">
                    {t('permits.list.columns.updated')}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {permits.map((permit) => (
                  <TableRow
                    key={permit.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/permits/${permit.id}`)}
                  >
                    <TableCell>{permit.reference}</TableCell>
                    <TableCell>{permit.projectTitle}</TableCell>
                    <TableCell>{permit.principalInvestigator}</TableCell>
                    <TableCell>
                      <StatusBadge status={permit.status} />
                    </TableCell>
                    <TableCell align="right">
                      {new Date(permit.updatedAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  )
}

export default PermitListPage

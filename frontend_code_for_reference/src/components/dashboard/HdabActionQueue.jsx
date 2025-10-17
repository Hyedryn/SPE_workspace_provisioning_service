import PropTypes from 'prop-types'
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
import StatusBadge from '../common/StatusBadge.jsx'

const HdabActionQueue = ({ permits }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const actionableStatuses = new Set([
    'DATA_PREPARATION_PENDING',
    'DATA_PREPARATION_REWORK',
    'DATA_PREPARATION_REVIEW_PENDING',
    'WORKSPACE_SETUP_PENDING',
    'WORKSPACE_SETUP_REWORK',
    'WORKSPACE_SETUP_REVIEW_PENDING',
  ])

  const queue = permits.filter((permit) => {
    if (actionableStatuses.has(permit.status)) {
      return true
    }

    if (
      permit.status === 'ANALYSIS_ACTIVE' &&
      (permit.egressSummary?.pending ?? 0) > 0
    ) {
      return true
    }

    return false
  })

  return (
    <Paper elevation={0} sx={{ p: 3 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6">{t('dashboard.hdabQueue.title')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('dashboard.hdabQueue.subtitle')}
        </Typography>
      </Box>

      {queue.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('dashboard.hdabQueue.empty')}
        </Typography>
      ) : (
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('dashboard.hdabQueue.columns.permitId')}</TableCell>
                <TableCell>{t('dashboard.hdabQueue.columns.project')}</TableCell>
                <TableCell>{t('dashboard.hdabQueue.columns.status')}</TableCell>
                <TableCell align="right">
                  {t('dashboard.hdabQueue.columns.updated')}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {queue.map((permit) => (
                <TableRow
                  key={permit.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/permits/${permit.id}`)}
                >
                  <TableCell>{permit.reference}</TableCell>
                  <TableCell>{permit.projectTitle}</TableCell>
                  <TableCell>
                    <StatusBadge status={permit.status} />
                  </TableCell>
                  <TableCell align="right">
                    {new Date(permit.updatedAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  )
}

HdabActionQueue.propTypes = {
  permits: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      reference: PropTypes.string,
      projectTitle: PropTypes.string,
      status: PropTypes.string,
      updatedAt: PropTypes.string,
    }),
  ),
}

export default HdabActionQueue

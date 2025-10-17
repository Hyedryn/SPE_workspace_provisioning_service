import PropTypes from 'prop-types'
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import StatusBadge from '../common/StatusBadge.jsx'

const SUPPORTED_STATUSES = [
  'AWAITING_INGRESS',
  'INGRESS_IN_PROGRESS',
  'DATA_PREPARATION_PENDING',
]

const DataHolderIngressList = ({ permits }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const assignments = (permits ?? []).filter((permit) =>
    SUPPORTED_STATUSES.includes(permit.status),
  )

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <CloudUploadIcon color="primary" fontSize="small" />
        <Typography variant="h6">
          {t('dashboard.dataHolderIngress.title')}
        </Typography>
      </Stack>

      {assignments.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('dashboard.dataHolderIngress.empty')}
        </Typography>
      ) : (
        <Stack spacing={2}>
          {assignments.map((permit) => (
            <Card key={permit.id} variant="outlined">
              <CardActionArea onClick={() => navigate(`/data-ingress/${permit.id}`)}>
                <CardContent>
                  <Stack spacing={1.5}>
                    <Typography variant="subtitle1" fontWeight={600} noWrap>
                      {permit.projectTitle}
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      useFlexGap
                      sx={{ flexWrap: 'wrap' }}
                    >
                      <StatusBadge status={permit.status} />
                      {permit.dataset && <Chip size="small" label={permit.dataset} />}
                      {permit.reference && (
                        <Chip size="small" variant="outlined" label={permit.reference} />
                      )}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {t('dashboard.dataHolderIngress.contact', {
                        contact:
                          permit.assignedHdabTeam?.[0]?.user?.fullName ??
                          t('dashboard.dataHolderIngress.contactFallback'),
                      })}
                    </Typography>
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      )}
    </Box>
  )
}

DataHolderIngressList.propTypes = {
  permits: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      projectTitle: PropTypes.string,
      status: PropTypes.string,
      dataset: PropTypes.string,
      reference: PropTypes.string,
      assignedHdabTeam: PropTypes.array,
    }),
  ),
}

export default DataHolderIngressList

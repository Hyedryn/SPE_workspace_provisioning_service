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
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import StatusBadge from '../common/StatusBadge.jsx'

const ResearcherProjectGrid = ({ permits }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const myPermits = permits.filter((permit) =>
    [
      'DATA_PREPARATION_PENDING',
      'DATA_PREPARATION_REVIEW_PENDING',
      'DATA_PREPARATION_REWORK',
      'WORKSPACE_SETUP_PENDING',
      'WORKSPACE_SETUP_REWORK',
      'WORKSPACE_SETUP_REVIEW_PENDING',
      'ANALYSIS_ACTIVE',
      'ANALYSIS_PAUSED',
    ].includes(permit.status),
  )

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>
        {t('dashboard.researcherGrid.title')}
      </Typography>
      <Stack spacing={2}>
        {myPermits.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {t('dashboard.researcherGrid.empty')}
          </Typography>
        )}
        {myPermits.map((permit) => (
          <Card key={permit.id} variant="outlined">
            <CardActionArea
              onClick={() => navigate(`/my-permits/${permit.id}`)}
            >
              <CardContent>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle1" fontWeight={600}>
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
                    {(permit.egressSummary?.changesRequested ?? 0) > 0 && (
                      <Chip
                        size="small"
                        color="warning"
                        variant="outlined"
                        label={t('dashboard.researcherGrid.changesRequested', {
                          count: permit.egressSummary.changesRequested,
                        })}
                      />
                    )}
                    {(permit.egressSummary?.pending ?? 0) > 0 && (
                      <Chip
                        size="small"
                        color="info"
                        variant="outlined"
                        label={t('dashboard.researcherGrid.pendingReviews', {
                          count: permit.egressSummary.pending,
                        })}
                      />
                    )}
                  </Stack>
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    useFlexGap
                    sx={{ flexWrap: 'wrap' }}
                  >
                    <Chip
                      size="small"
                      label={t('dashboard.researcherGrid.lead', {
                        name: permit.principalInvestigator,
                      })}
                    />
                    <Chip
                      size="small"
                      label={t('dashboard.researcherGrid.teamCount', {
                        count: permit.team?.length ?? 0,
                      })}
                    />
                  </Stack>
                </Stack>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Stack>
    </Box>
  )
}

ResearcherProjectGrid.propTypes = {
  permits: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      projectTitle: PropTypes.string,
      status: PropTypes.string,
      principalInvestigator: PropTypes.string,
      team: PropTypes.array,
    }),
  ),
}

export default ResearcherProjectGrid

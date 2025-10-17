import PropTypes from 'prop-types'
import { Paper, Stack, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import PermitActionPanel from './PermitActionPanel.jsx'
import { PROJECT_INVESTIGATOR_ROLE } from '../../utils/roles.js'

const buildContactLine = (label, value) => {
  if (!value) {
    return null
  }

  return (
    <Typography variant="body2">
      <strong>{label}:</strong> {value}
    </Typography>
  )
}

const DataHolderActionPanel = ({ permit }) => {
  const { t } = useTranslation()

  if (!permit) {
    return null
  }

  const principalInvestigator = permit.team?.find(
    (member) => member?.role === PROJECT_INVESTIGATOR_ROLE,
  )

  const hdabPreparator = permit.assignedHdabTeam?.find(
    (assignment) => assignment?.user,
  )?.user

  return (
    <Stack spacing={3}>
      <PermitActionPanel permit={permit} scope="dataHolder" />
      <Paper elevation={0} sx={{ p: 3 }}>
        <Stack spacing={1}>
          <Typography variant="h6">
            {t('permits.dataHolderPanel.title')}
          </Typography>
          <Typography color="text.secondary">
            {t('permits.dataHolderPanel.subtitle')}
          </Typography>
          {buildContactLine(
            t('permits.dataHolderPanel.principalInvestigator'),
            principalInvestigator
              ? `${principalInvestigator.name} (${principalInvestigator.email})`
              : null,
          )}
          {buildContactLine(
            t('permits.dataHolderPanel.coordinator'),
            hdabPreparator
              ? `${hdabPreparator.fullName ?? hdabPreparator.email} (${hdabPreparator.email})`
              : null,
          )}
        </Stack>
      </Paper>
    </Stack>
  )
}

DataHolderActionPanel.propTypes = {
  permit: PropTypes.shape({
    team: PropTypes.array,
    assignedHdabTeam: PropTypes.array,
  }),
}

export default DataHolderActionPanel

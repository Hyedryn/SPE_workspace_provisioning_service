import PropTypes from 'prop-types'
import {
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Paper,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { getProjectRoleLabel } from '../../utils/roles.js'

const PermitTeamList = ({ team }) => {
  const { t } = useTranslation()

  return (
    <Paper elevation={0} sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        {t('permits.teamList.title')}
      </Typography>
      <List>
        {team?.map((member) => (
          <ListItem key={member.id} disableGutters>
            <ListItemAvatar>
              <Avatar>{member.name?.[0] ?? '?'}</Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={member.name}
              secondary={[getProjectRoleLabel(member.role), member.organization]
                .filter(Boolean)
                .join(' - ')}
            />
          </ListItem>
        )) ?? (
          <Typography color="text.secondary">
            {t('permits.teamList.empty')}
          </Typography>
        )}
      </List>
    </Paper>
  )
}

PermitTeamList.propTypes = {
  team: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string,
      role: PropTypes.string,
      organization: PropTypes.string,
    }),
  ),
}

export default PermitTeamList


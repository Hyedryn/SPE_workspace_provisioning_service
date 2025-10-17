import PropTypes from 'prop-types'
import {
  Avatar,
  Box,
  Button,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Paper,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { getHdabPermitRoleLabel } from '../../utils/roles.js'

const getDisplayName = (assignment) =>
  assignment?.user?.fullName ?? assignment?.displayName ?? assignment?.userId

const getAssignmentKey = (assignment) => {
  const sortedRoles = [...(assignment?.permitRoles ?? [])].sort()
  return `${assignment?.userId ?? 'unknown'}-${sortedRoles.join('|')}`
}

const buildSecondaryLine = (assignment, separator) => {
  const roleLabels = (assignment?.permitRoles ?? [])
    .map((role) => getHdabPermitRoleLabel(role))
    .filter(Boolean)

  const parts = []

  if (roleLabels.length > 0) {
    parts.push(roleLabels.join(', '))
  }

  if (assignment?.user?.email) {
    parts.push(assignment.user.email)
  }

  if (assignment?.user?.organization) {
    parts.push(assignment.user.organization)
  }

  return parts.filter(Boolean).join(separator)
}

const PermitHdabTeamList = ({ assignments, canManage = false, onManageClick }) => {
  const { t } = useTranslation()
  const hasAssignments = Array.isArray(assignments) && assignments.length > 0
  const separator = t('common.separator')

  return (
    <Paper elevation={0} sx={{ p: 3 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
        }}
      >
        <Typography variant="h6">{t('permits.hdabTeam.title')}</Typography>
        {canManage && (
          <Button variant="outlined" size="small" onClick={onManageClick}>
            {t('permits.hdabTeam.manage')}
          </Button>
        )}
      </Box>

      {hasAssignments ? (
        <List>
          {assignments.map((assignment) => (
            <ListItem key={getAssignmentKey(assignment)} disableGutters>
              <ListItemAvatar>
                <Avatar>{getDisplayName(assignment)?.[0] ?? '?'}</Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={getDisplayName(assignment)}
                secondary={buildSecondaryLine(assignment, separator)}
              />
            </ListItem>
          ))}
        </List>
      ) : (
        <Typography color="text.secondary">
          {t('permits.hdabTeam.empty')}
        </Typography>
      )}
    </Paper>
  )
}

PermitHdabTeamList.propTypes = {
  assignments: PropTypes.arrayOf(
    PropTypes.shape({
      userId: PropTypes.string.isRequired,
      permitRoles: PropTypes.arrayOf(PropTypes.string).isRequired,
      user: PropTypes.shape({
        id: PropTypes.string,
        fullName: PropTypes.string,
        email: PropTypes.string,
        organization: PropTypes.string,
      }),
      displayName: PropTypes.string,
    }),
  ),
  canManage: PropTypes.bool,
  onManageClick: PropTypes.func,
}

export default PermitHdabTeamList


import { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import DeleteIcon from '@mui/icons-material/Delete'
import { useTranslation } from 'react-i18next'
import { useAppDispatch } from '../../hooks/useAppDispatch.js'
import { assignHdabTeamMember, removeHdabTeamMember } from '../../features/permits/permitsSlice.js'
import { searchHdabStaff } from '../../api/hdabApi.js'
import {
  HDAB_PERMIT_ROLES,
  getHdabPermitRoleLabel,
} from '../../utils/roles.js'

const HdabTeamManagementDialog = ({ open, onClose, permit }) => {
  const dispatch = useAppDispatch()
  const { t } = useTranslation()
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedRole, setSelectedRole] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [error, setError] = useState(null)
  const [assigning, setAssigning] = useState(false)
  const [removingAssignmentId, setRemovingAssignmentId] = useState(null)
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  useEffect(() => {
    if (!open) {
      setSearchTerm('')
      setSearchResults([])
      setSelectedUser(null)
      setSelectedRole('')
      setFeedback(null)
      setError(null)
      setAssigning(false)
      setRemovingAssignmentId(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const trimmed = searchTerm.trim()

    if (trimmed.length < 2) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    setSearchLoading(true)

    const timer = setTimeout(async () => {
      try {
        const response = await searchHdabStaff(trimmed)
        const options = response.results ?? []
        setSearchResults(options)
        setError(null)
      } catch (searchError) {
        setError(
          searchError?.response?.data?.message ??
            t('hdabTeamDialog.errors.search'),
        )
      } finally {
        setSearchLoading(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [searchTerm, open, t])

  const handleAssign = async () => {
    if (!permit?.id || !selectedUser?.id || !selectedRole) {
      return
    }

    setAssigning(true)
    setError(null)

    try {
      const result = await dispatch(
        assignHdabTeamMember({
          permitId: permit.id,
          userId: selectedUser.id,
          permitRole: selectedRole,
        }),
      ).unwrap()

      setFeedback({
        severity: 'success',
        message:
          result.message ??
          t('hdabTeamDialog.success.assign', {
            name: selectedUser.fullName ?? selectedUser.email,
            role: getHdabPermitRoleLabel(selectedRole),
          }),
      })
      setSelectedUser(null)
      setSelectedRole('')
      setSearchTerm('')
    } catch (assignError) {
      setError(assignError)
    } finally {
      setAssigning(false)
    }
  }

  const handleRemove = async ({ userId, permitRole }) => {
    if (!permit?.id || !userId || !permitRole) {
      return
    }

    const assignmentKey = `${userId}-${permitRole}`

    setRemovingAssignmentId(assignmentKey)
    setError(null)

    try {
      const result = await dispatch(
        removeHdabTeamMember({ permitId: permit.id, userId, permitRole }),
      ).unwrap()

      setFeedback({
        severity: 'success',
        message:
          result.message ?? t('hdabTeamDialog.success.remove'),
      })
    } catch (removeError) {
      setError(removeError)
    } finally {
      setRemovingAssignmentId(null)
    }
  }

  const assignments = useMemo(() => {
    if (!permit?.assignedHdabTeam) {
      return []
    }

    return permit.assignedHdabTeam.flatMap((assignment) => {
      if (!assignment) {
        return []
      }

      const roles = Array.isArray(assignment.permitRoles)
        ? assignment.permitRoles
        : []

      return roles.map((role) => ({
        userId: assignment.userId,
        permitRole: role,
        user: assignment.user,
      }))
    })
  }, [permit])

  const assignedRolesForSelectedUser = useMemo(() => {
    if (!selectedUser?.id) {
      return new Set()
    }

    return new Set(
      assignments
        .filter((assignment) => assignment.userId === selectedUser.id)
        .map((assignment) => assignment.permitRole),
    )
  }, [assignments, selectedUser])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle>{t('hdabTeamDialog.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('hdabTeamDialog.description')}
          </Typography>

          {feedback && (
            <Alert
              severity={feedback.severity}
              onClose={() => setFeedback(null)}
            >
              {feedback.message}
            </Alert>
          )}

          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Autocomplete
            fullWidth
            options={searchResults}
            value={selectedUser}
            onChange={(event, value) => setSelectedUser(value)}
            inputValue={searchTerm}
            onInputChange={(event, value) => setSearchTerm(value)}
            loading={searchLoading}
            getOptionLabel={(option) =>
              option?.fullName
                ? `${option.fullName} (${option.email})`
                : option?.email ?? ''
            }
          renderInput={(params) => (
            <TextField
              {...params}
              label={t('hdabTeamDialog.search.label')}
              placeholder={t('hdabTeamDialog.search.placeholder')}
              helperText={t('hdabTeamDialog.search.helper')}
            />
          )}
        />

        <FormControl fullWidth>
          <InputLabel id="hdab-role-select-label">
            {t('hdabTeamDialog.roleLabel')}
          </InputLabel>
          <Select
            labelId="hdab-role-select-label"
            label={t('hdabTeamDialog.roleLabel')}
            value={selectedRole}
            onChange={(event) => setSelectedRole(event.target.value)}
          >
              {HDAB_PERMIT_ROLES.map((role) => {
                const isRoleAssigned = assignedRolesForSelectedUser.has(role)
                return (
                  <MenuItem key={role} value={role} disabled={isRoleAssigned}>
                    {getHdabPermitRoleLabel(role)}
                  </MenuItem>
                )
              })}
            </Select>
          </FormControl>

          <Box>
            <Button
              variant="contained"
              onClick={handleAssign}
              disabled={!selectedUser || !selectedRole || assigning}
            >
              {t('hdabTeamDialog.assignButton')}
            </Button>
          </Box>

          <Box>
            <Typography variant="subtitle1" gutterBottom>
              {t('hdabTeamDialog.currentHeading')}
            </Typography>
            {assignments.length === 0 ? (
              <Typography color="text.secondary">
                {t('hdabTeamDialog.empty')}
              </Typography>
            ) : (
              <List>
                {assignments.map((assignment) => {
                  const assignmentKey = `${assignment.userId}-${assignment.permitRole}`

                  return (
                    <ListItem
                      key={`${assignment.userId}-${assignment.permitRole}`}
                      secondaryAction={
                        <IconButton
                          edge="end"
                          aria-label={t('hdabTeamDialog.removeAriaLabel')}
                          onClick={() => handleRemove(assignment)}
                          disabled={removingAssignmentId === assignmentKey}
                        >
                          <DeleteIcon />
                        </IconButton>
                      }
                      >
                        <ListItemText
                          primary={assignment.user?.fullName ?? assignment.userId}
                          secondary={`${getHdabPermitRoleLabel(
                            assignment.permitRole,
                          )}${t('common.separator')}${
                            assignment.user?.email ?? t('hdabTeamDialog.noEmail')
                          }`}
                        />
                    </ListItem>
                  )
                })}
              </List>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  )
}

HdabTeamManagementDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  permit: PropTypes.shape({
    id: PropTypes.string,
    assignedHdabTeam: PropTypes.arrayOf(
      PropTypes.shape({
        userId: PropTypes.string.isRequired,
        permitRoles: PropTypes.arrayOf(PropTypes.string).isRequired,
        user: PropTypes.shape({
          id: PropTypes.string,
          fullName: PropTypes.string,
          email: PropTypes.string,
          organization: PropTypes.string,
        }),
      }),
    ),
  }),
}

export default HdabTeamManagementDialog

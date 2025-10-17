import {
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useAppSelector } from '../hooks/useAppSelector.js'
import { selectCurrentUser } from '../features/auth/authSlice.js'

const AccountPage = () => {
  const { t } = useTranslation()
  const user = useAppSelector(selectCurrentUser)

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
          <Avatar sx={{ width: 80, height: 80, bgcolor: 'primary.main' }}>
            {(user?.fullName?.[0] ?? t('common.userFallback').charAt(0)).toUpperCase()}
          </Avatar>
          <Box flex={1}>
            <Typography variant="h5">
              {user?.fullName ?? t('account.unknownUser')}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              {user?.email ?? t('account.noEmail')}
            </Typography>

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" color="text.secondary">
              {t('account.rolesHeading')}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
              {user?.roles?.map((role) => (
                <Chip
                  key={role}
                  label={t(`roles.global.${role}`, {
                    defaultValue: role.replace(/_/g, ' '),
                  })}
                  size="small"
                />
              )) || <Typography>{t('account.noRoles')}</Typography>}
            </Stack>

            <Typography variant="subtitle2" color="text.secondary">
              {t('account.organisationHeading')}
            </Typography>
            <Typography>
              {user?.organization ?? t('account.organisationFallback')}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  )
}

export default AccountPage

import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppDispatch } from '../hooks/useAppDispatch.js'
import { useAppSelector } from '../hooks/useAppSelector.js'
import {
  clearAuthError,
  login,
  selectAuthError,
  selectAuthStatus,
  selectIsAuthenticated,
} from '../features/auth/authSlice.js'

const LoginPage = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const authError = useAppSelector(selectAuthError)
  const authStatus = useAppSelector(selectAuthStatus)
  const isAuthenticated = useAppSelector(selectIsAuthenticated)

  const [formValues, setFormValues] = useState({
    email: '',
    password: '',
  })

  useEffect(() => {
    if (isAuthenticated) {
      const redirectTo = location.state?.from?.pathname ?? '/dashboard'
      navigate(redirectTo, { replace: true })
    }
  }, [isAuthenticated, navigate, location.state])

  useEffect(() => {
    return () => {
      dispatch(clearAuthError())
    }
  }, [dispatch])

  const handleChange = (event) => {
    setFormValues((prev) => ({
      ...prev,
      [event.target.name]: event.target.value,
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!formValues.email || !formValues.password) {
      return
    }
    await dispatch(login(formValues))
  }

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'background.default',
        px: 2,
        py: 6,
      }}
    >
      <Card
        sx={{
          width: '100%',
          maxWidth: 420,
          mx: 'auto',
          boxShadow: { xs: 'none', sm: 6 },
        }}
      >
        <CardContent>
          <Stack spacing={3}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
              <Box
                component="img"
                src="/HDAlogo.svg"
                alt="HDA Logo"
                sx={{
                  width: '100%',
                  maxWidth: 180,
                  height: 'auto',
                }}
              />
            </Box>

            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" component="h1" gutterBottom>
                {t('auth.login.title')}
              </Typography>
              <Typography color="text.secondary">
                {t('auth.login.subtitle')}
              </Typography>
            </Box>

            {authError && (
              <Alert severity="error" onClose={() => dispatch(clearAuthError())}>
                {authError}
              </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit}>
              <Stack spacing={2}>
                <TextField
                  name="email"
                  label={t('auth.login.email')}
                  type="email"
                  value={formValues.email}
                  onChange={handleChange}
                  required
                  autoFocus
                />
                <TextField
                  name="password"
                  label={t('auth.login.password')}
                  type="password"
                  value={formValues.password}
                  onChange={handleChange}
                  required
                />
                <Button
                  variant="contained"
                  type="submit"
                  size="large"
                  disabled={authStatus === 'loading'}
                >
                  {authStatus === 'loading'
                    ? t('auth.login.submitting')
                    : t('auth.login.submit')}
                </Button>
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}

export default LoginPage


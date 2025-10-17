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
import { Navigate, useParams } from 'react-router-dom'
import { submitOutput } from '../api/outputsApi.js'
import { useAppDispatch } from '../hooks/useAppDispatch.js'
import { useAppSelector } from '../hooks/useAppSelector.js'
import {
  fetchPermitById,
  selectPermitDetail,
  selectPermitsError,
  selectPermitsStatus,
} from '../features/permits/permitsSlice.js'
import { fetchPermitOutputs } from '../features/outputs/outputsSlice.js'
import LoadingSpinner from '../components/common/LoadingSpinner.jsx'
import { usePermitPermissions } from '../hooks/usePermitPermissions.js'
import { useTranslation } from 'react-i18next'

const SubmitOutputPage = () => {
  const { permitId } = useParams()
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const permit = useAppSelector(selectPermitDetail)
  const permitsStatus = useAppSelector(selectPermitsStatus)
  const permitsError = useAppSelector(selectPermitsError)
  const isLoadedPermit = permit?.id === permitId
  const permissions = usePermitPermissions(isLoadedPermit ? permit : null)
  const [folderPath, setFolderPath] = useState('')
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (permitId && !isLoadedPermit) {
      dispatch(fetchPermitById(permitId))
    }
  }, [dispatch, permitId, isLoadedPermit])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage(null)
    setError(null)

    const trimmedDescription = description.trim()

    if (!trimmedDescription) {
      setError(t('submitOutput.form.missingJustification'))
      setIsSubmitting(false)
      return
    }

    try {
      const data = await submitOutput(permitId, {
        folderPath,
        description: trimmedDescription,
      })
      setMessage(
        data.message ??
          t('submitOutput.form.success', {
            id: data.output.id,
          }),
      )
      setFolderPath('')
      setDescription('')
      if (permitId) {
        dispatch(fetchPermitById(permitId))
        dispatch(fetchPermitOutputs(permitId))
      }
    } catch (error) {
      const apiMessage =
        error.response?.data?.message ??
        t('submitOutput.form.error')
      setError(apiMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isLoadedPermit) {
    if (permitsStatus === 'loading') {
      return <LoadingSpinner label={t('submitOutput.loading')} />
    }

    if (permitsError) {
      return <Alert severity="error">{permitsError}</Alert>
    }

    return (
      <Alert severity="info">{t('submitOutput.notFound')}</Alert>
    )
  }

  if (!permissions.canSubmitOutputs) {
    return <Navigate to="/403" replace />
  }

  return (
    <Box maxWidth={640}>
      <Typography variant="h4" gutterBottom>
        {t('submitOutput.title')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t('submitOutput.subtitle')}
      </Typography>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2} component="form" onSubmit={handleSubmit}>
            {message && (
              <Alert severity="success" onClose={() => setMessage(null)}>
                {message}
              </Alert>
            )}
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
            <TextField
              label={t('submitOutput.form.pathLabel')}
              value={folderPath}
              onChange={(event) => setFolderPath(event.target.value)}
              required
              placeholder={t('submitOutput.form.pathPlaceholder')}
            />
            <TextField
              label={t('submitOutput.form.justificationLabel')}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
              multiline
              minRows={4}
              helperText={t('submitOutput.form.justificationHelper')}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={!folderPath || !description.trim() || isSubmitting}
            >
              {isSubmitting
                ? t('submitOutput.form.submitting')
                : t('submitOutput.form.submit')}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}

export default SubmitOutputPage

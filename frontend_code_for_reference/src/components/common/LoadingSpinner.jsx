import PropTypes from 'prop-types'
import { Box, CircularProgress, Typography } from '@mui/material'

const LoadingSpinner = ({ label }) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      py: 6,
    }}
  >
    <CircularProgress />
    {label && (
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    )}
  </Box>
)

LoadingSpinner.propTypes = {
  label: PropTypes.string,
}

export default LoadingSpinner

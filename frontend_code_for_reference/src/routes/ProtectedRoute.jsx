import PropTypes from 'prop-types'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAppSelector } from '../hooks/useAppSelector.js'
import {
  selectIsAuthenticated,
  selectCurrentUser,
  selectIsSessionChecked,
} from '../features/auth/authSlice.js'
import { isSuperAdmin, matchesRolePattern } from '../utils/roles.js'

const matchesRole = (userRoles = [], requiredRoles) => {
  if (isSuperAdmin(userRoles)) {
    return true
  }

  if (!requiredRoles?.length) {
    return true
  }

  return requiredRoles.some((pattern) => matchesRolePattern(userRoles, pattern))
}

const ProtectedRoute = ({ roles = [] }) => {
  const isAuthenticated = useAppSelector(selectIsAuthenticated)
  const user = useAppSelector(selectCurrentUser)
  const isSessionChecked = useAppSelector(selectIsSessionChecked)
  const location = useLocation()

  if (!isSessionChecked) {
    return null
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (roles.length && !matchesRole(user?.roles ?? [], roles)) {
    return <Navigate to="/403" replace />
  }

  return <Outlet />
}

ProtectedRoute.propTypes = {
  roles: PropTypes.arrayOf(PropTypes.string),
}

export default ProtectedRoute

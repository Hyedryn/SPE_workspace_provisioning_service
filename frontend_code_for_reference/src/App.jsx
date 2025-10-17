import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Box, CircularProgress } from '@mui/material'
import ProtectedRoute from './routes/ProtectedRoute.jsx'
import LoginPage from './pages/LoginPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import AccountPage from './pages/AccountPage.jsx'
import AccessDeniedPage from './pages/AccessDeniedPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'
import PermitListPage from './pages/PermitListPage.jsx'
import PermitDetailPage from './pages/PermitDetailPage.jsx'
import WorkspacePage from './pages/WorkspacePage.jsx'
import SubmitOutputPage from './pages/SubmitOutputPage.jsx'
import TeamManagementPage from './pages/TeamManagementPage.jsx'
import DataHolderManagementPage from './pages/DataHolderManagementPage.jsx'
import MyPermitsPage from './pages/MyPermitsPage.jsx'
import AuditLogPage from './pages/AuditLogPage.jsx'
import { useAppDispatch } from './hooks/useAppDispatch.js'
import { useAppSelector } from './hooks/useAppSelector.js'
import {
  fetchUser,
  selectAuthStatus,
  selectIsSessionChecked,
} from './features/auth/authSlice.js'
import PortalLayout from './layouts/PortalLayout.jsx'
import DataIngressPage from './pages/DataIngressPage.jsx'
import { DATA_HOLDER_GLOBAL_ROLE } from './utils/roles.js'

const App = () => {
  const dispatch = useAppDispatch()
  const authStatus = useAppSelector(selectAuthStatus)
  const isSessionChecked = useAppSelector(selectIsSessionChecked)

  useEffect(() => {
    dispatch(fetchUser())
  }, [dispatch])

  const showGlobalSpinner = authStatus === 'loading' || !isSessionChecked

  return (
    <>
      {showGlobalSpinner && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            bgcolor: 'rgba(255,255,255,0.6)',
            zIndex: (theme) => theme.zIndex.tooltip + 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CircularProgress />
        </Box>
      )}

      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<PortalLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route
              element={
                <ProtectedRoute
                  roles={['HDAB_*', 'HEALTH_DATA_USER']}
                />
              }
            >
              <Route path="/activity-log" element={<AuditLogPage />} />
            </Route>

            <Route element={<ProtectedRoute roles={['HDAB_*']} />}> 
              <Route path="/permits" element={<PermitListPage />} />
              <Route path="/permits/:permitId" element={<PermitDetailPage />} />
              <Route
                path="/permits/:permitId/workspace/:type"
                element={<WorkspacePage scope="hdab" />}
              />
              <Route
                path="/permits/:permitId/data-holders"
                element={<DataHolderManagementPage />}
              />
            </Route>

            <Route
              element={<ProtectedRoute roles={['HEALTH_DATA_USER']} />}
            >
              <Route path="/my-permits" element={<MyPermitsPage />} />
              <Route
                path="/my-permits/:permitId"
                element={<PermitDetailPage scope="member" />}
              />
              <Route
                path="/my-permits/:permitId/workspace/analysis"
                element={<WorkspacePage scope="member" />}
              />
            <Route
              path="/my-permits/:permitId/outputs/new"
              element={<SubmitOutputPage />}
            />
            <Route
              path="/my-permits/:permitId/team"
              element={<TeamManagementPage />}
            />
          </Route>

          <Route element={<ProtectedRoute roles={[DATA_HOLDER_GLOBAL_ROLE]} />}>
            <Route path="/data-ingress" element={<DataIngressPage />} />
            <Route
              path="/data-ingress/:permitId"
              element={<PermitDetailPage scope="dataHolder" />}
            />
          </Route>
        </Route>
      </Route>

        <Route path="/403" element={<AccessDeniedPage />} />
        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </>
  )
}

export default App

import { useMemo } from 'react'
import PropTypes from 'prop-types'
import {
  AppBar,
  Avatar,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
  Button,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import LogoutIcon from '@mui/icons-material/Logout'
import DashboardIcon from '@mui/icons-material/Dashboard'
import AssignmentIcon from '@mui/icons-material/Assignment'
import AccountCircleIcon from '@mui/icons-material/AccountCircle'
import HistoryIcon from '@mui/icons-material/History'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppDispatch } from '../hooks/useAppDispatch.js'
import { useAppSelector } from '../hooks/useAppSelector.js'
import {
  logout,
  selectCurrentUser,
} from '../features/auth/authSlice.js'
import {
  selectIsSidebarOpen,
  toggleSidebar,
} from '../features/ui/uiSlice.js'
import {
  hasDataHolderGlobalRole,
  isHdabStaff,
  isSuperAdmin,
} from '../utils/roles.js'
import LanguageSwitcher from '../components/common/LanguageSwitcher.jsx'

const drawerWidth = 260
const toolbarHeights = {
  xs: 56,
  sm: 64,
}

const PortalLayout = ({ windowRef }) => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const isSidebarOpen = useAppSelector(selectIsSidebarOpen)
  const user = useAppSelector(selectCurrentUser)

  const navigationItems = useMemo(() => {
    const items = [
      {
        labelKey: 'navigation.dashboard',
        path: '/dashboard',
        matchPath: '/dashboard',
        icon: <DashboardIcon fontSize="small" />,
      },
      {
        labelKey: 'navigation.account',
        path: '/account',
        matchPath: '/account',
        icon: <AccountCircleIcon fontSize="small" />,
      },
    ]

    const roles = user?.roles ?? []
    const hasHealthDataAccess = roles.includes('HEALTH_DATA_USER')
    const hasIngressAccess = hasDataHolderGlobalRole(roles)
    const canViewActivityLog =
      isSuperAdmin(roles) || isHdabStaff(roles) || hasHealthDataAccess

    if (canViewActivityLog) {
      items.push({
        labelKey: 'navigation.activityLog',
        path: '/activity-log',
        matchPath: '/activity-log',
        icon: <HistoryIcon fontSize="small" />,
      })
    }

    if (isHdabStaff(roles)) {
      items.push({
        labelKey: 'navigation.permitQueue',
        path: '/permits',
        matchPath: '/permits',
        icon: <AssignmentIcon fontSize="small" />,
      })
    }

    if (isSuperAdmin(roles) || hasHealthDataAccess) {
      items.push({
        labelKey: 'navigation.myPermits',
        path: '/my-permits',
        matchPath: '/my-permits',
        icon: <AssignmentIcon fontSize="small" />,
      })
    }

    if (hasIngressAccess) {
      items.push({
        labelKey: 'navigation.dataIngress',
        path: '/data-ingress',
        matchPath: '/data-ingress',
        icon: <CloudUploadIcon fontSize="small" />,
      })
    }

    return items
  }, [user])

  const handleNavigation = (path) => {
    navigate(path)
    if (isSidebarOpen) {
      dispatch(toggleSidebar())
    }
  }

  const container =
    windowRef !== undefined ? () => windowRef().document.body : undefined

  const userRoles = user?.roles ?? []

  const drawer = (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'background.paper',
      }}
    >
      <Box
        sx={(theme) => ({
          position: 'sticky',
          top: 0,
          zIndex: 1,
          px: 2.5,
          py: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          backgroundColor: 'background.paper',
          borderBottom: `1px solid ${theme.palette.divider}`,
        })}
      >
        <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40 }}>
          {(user?.fullName?.[0] ?? t('common.userFallback').charAt(0)).toUpperCase()}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={600} noWrap>
            {user?.fullName ?? t('navigation.guestUser')}
          </Typography>
          <Stack
            direction="row"
            spacing={0.75}
            flexWrap="wrap"
            useFlexGap
            sx={{ mt: 0.5 }}
          >
            {userRoles.length > 0 ? (
              userRoles.map((role) => (
                <Chip
                  key={role}
                  label={t(`roles.global.${role}`, {
                    defaultValue: role.replace(/_/g, ' '),
                  })}
                  size="small"
                  variant="outlined"
                  sx={{
                    textTransform: 'capitalize',
                    borderRadius: 1,
                  }}
                />
              ))
            ) : (
              <Chip label={t('navigation.unknownRole')} size="small" variant="outlined" />
            )}
          </Stack>
        </Box>
      </Box>
      <Divider />
      <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 1.5, py: 1 }}>
        <List sx={{ pt: 0 }}>
          {navigationItems.map((item) => (
            <ListItemButton
              key={item.path}
              selected={location.pathname.startsWith(item.matchPath ?? item.path)}
              onClick={() => handleNavigation(item.path)}
              sx={{
                borderRadius: 1.5,
                mb: 0.5,
                '&.Mui-selected': {
                  bgcolor: 'primary.light',
                  color: 'primary.contrastText',
                  '&:hover': {
                    bgcolor: 'primary.light',
                  },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primaryTypographyProps={{ fontWeight: 500 }}
                primary={t(item.labelKey)}
              />
            </ListItemButton>
          ))}
        </List>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Button
          fullWidth
          variant="outlined"
          startIcon={<LogoutIcon />}
          onClick={async () => {
            try {
              await dispatch(logout()).unwrap()
            } catch (error) {
              console.error('Failed to sign out cleanly', error)
            } finally {
              navigate('/login', { replace: true })
            }
          }}
        >
          {t('app.signOut')}
        </Button>
      </Box>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          bgcolor: 'primary.main',
        }}
      >
        <Toolbar sx={{ gap: 2 }}>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => dispatch(toggleSidebar())}
            sx={{ mr: 2, display: { sm: 'none' } }}
            aria-label={t('app.openNavigation')}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div">
            {t('app.title')}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <LanguageSwitcher
            labelId="language-switcher-toolbar"
            variant="standard"
            sx={{
              display: 'flex',
              minWidth: { xs: 120, sm: 150 },
              '& .MuiInputBase-root': { color: 'inherit' },
              '& .MuiSvgIcon-root': { color: 'inherit' },
              '& .MuiInputLabel-root': { color: 'inherit' },
              '& .MuiInputLabel-root.Mui-focused': { color: 'inherit' },
              '& .MuiInput-underline:before': {
                borderBottomColor: 'rgba(255,255,255,0.6)',
              },
              '& .MuiInput-underline:hover:not(.Mui-disabled):before': {
                borderBottomColor: '#fff',
              },
              '& .MuiInput-underline:after': {
                borderBottomColor: '#fff',
              },
            }}
          />
        </Toolbar>
      </AppBar>
      <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }} aria-label="portal navigation">
        <Drawer
          container={container}
          variant="temporary"
          open={isSidebarOpen}
          onClose={() => dispatch(toggleSidebar())}
          ModalProps={{
            keepMounted: true,
          }}
          sx={(theme) => ({
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              top: toolbarHeights.xs,
              height: `calc(100% - ${toolbarHeights.xs}px)`,
              borderRight: `1px solid ${theme.palette.divider}`,
              backgroundColor: theme.palette.background.paper,
              [theme.breakpoints.up('sm')]: {
                top: toolbarHeights.sm,
                height: `calc(100% - ${toolbarHeights.sm}px)`,
              },
            },
          })}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={(theme) => ({
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              top: toolbarHeights.sm,
              height: `calc(100% - ${toolbarHeights.sm}px)`,
              borderRight: `1px solid ${theme.palette.divider}`,
              backgroundColor: theme.palette.background.paper,
            },
          })}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          bgcolor: 'background.default',
        }}
      >
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  )
}

PortalLayout.propTypes = {
  windowRef: PropTypes.func,
}

export default PortalLayout

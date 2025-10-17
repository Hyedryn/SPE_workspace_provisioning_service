import { combineReducers, configureStore } from '@reduxjs/toolkit'
import authReducer, { logout } from '../features/auth/authSlice.js'
import permitsReducer from '../features/permits/permitsSlice.js'
import uiReducer from '../features/ui/uiSlice.js'
import outputsReducer from '../features/outputs/outputsSlice.js'
import auditReducer from '../features/audit/auditSlice.js'

const appReducer = combineReducers({
  auth: authReducer,
  permits: permitsReducer,
  outputs: outputsReducer,
  ui: uiReducer,
  audit: auditReducer,
})

const rootReducer = (state, action) => {
  if (action.type === logout.fulfilled.type) {
    state = undefined
  }

  return appReducer(state, action)
}

export const store = configureStore({
  reducer: rootReducer,
})

export const selectAuth = (state) => state.auth
export const selectPermits = (state) => state.permits
export const selectUi = (state) => state.ui
export const selectAudit = (state) => state.audit

export const AppDispatch = store.dispatch

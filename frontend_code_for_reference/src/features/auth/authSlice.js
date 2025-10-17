import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import {
  fetchCurrentUser,
  loginRequest,
  logoutRequest,
} from '../../api/authApi.js'

const initialState = {
  user: null,
  isAuthenticated: false,
  status: 'idle',
  error: null,
  isSessionChecked: false,
}

export const login = createAsyncThunk(
  'auth/login',
  async (credentials, { rejectWithValue }) => {
    try {
      const data = await loginRequest(credentials)
      return data
    } catch (error) {
      const message =
        error.response?.data?.message ?? 'Unable to sign in with provided credentials.'
      return rejectWithValue(message)
    }
  },
)

export const fetchUser = createAsyncThunk(
  'auth/fetchUser',
  async (_, { rejectWithValue }) => {
    try {
      const data = await fetchCurrentUser()
      return data
    } catch (error) {
      const status = error.response?.status ?? null
      const message = error.response?.data?.message ?? 'Failed to fetch user profile.'
      return rejectWithValue({ message, status })
    }
  },
)

export const logout = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      await logoutRequest()
      return true
    } catch (error) {
      const message = error.response?.data?.message ?? 'Failed to sign out.'
      return rejectWithValue(message)
    }
  },
)

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearAuthError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.user = action.payload.user
        state.isAuthenticated = true
        state.error = null
        state.isSessionChecked = true
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload ?? 'Login failed.'
        state.isAuthenticated = false
        state.isSessionChecked = true
      })
      .addCase(fetchUser.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchUser.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.user = action.payload.user
        state.isAuthenticated = true
        state.error = null
        state.isSessionChecked = true
      })
      .addCase(fetchUser.rejected, (state, action) => {
        state.user = null
        state.isAuthenticated = false
        state.isSessionChecked = true
        const status = action.payload?.status ?? action.error?.code
        if (status === 401) {
          state.status = 'idle'
          state.error = null
          return
        }
        state.status = 'failed'
        state.error = action.payload?.message ?? 'Unable to fetch user.'
      })
      .addCase(logout.pending, (state) => {
        state.error = null
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null
        state.isAuthenticated = false
        state.status = 'idle'
        state.error = null
        state.isSessionChecked = true
      })
      .addCase(logout.rejected, (state, action) => {
        state.user = null
        state.isAuthenticated = false
        state.status = 'idle'
        state.isSessionChecked = true
        state.error = action.payload ?? 'Failed to sign out.'
      })
  },
})

export const { clearAuthError } = authSlice.actions

export const selectCurrentUser = (state) => state.auth.user
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated
export const selectAuthStatus = (state) => state.auth.status
export const selectAuthError = (state) => state.auth.error
export const selectIsSessionChecked = (state) => state.auth.isSessionChecked

export default authSlice.reducer

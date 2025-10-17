import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { getPermitActivity } from '../../api/auditApi.js'

const DATE_RANGE_TO_DAYS = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '180d': 180,
}

const resolveSinceFromRange = (dateRange) => {
  if (!dateRange || dateRange === 'all') {
    return null
  }

  const days = DATE_RANGE_TO_DAYS[dateRange]
  if (!days) {
    return null
  }

  const since = new Date()
  since.setDate(since.getDate() - days)
  return since.toISOString()
}

const createDefaultFilters = () => ({
  dateRange: '30d',
  actionTypes: [],
  search: '',
})

const createDefaultPagination = () => ({
  page: 1,
  pageSize: 25,
  total: 0,
  hasMore: false,
})

const initialState = {
  selectedPermitId: null,
  recent: {
    entries: [],
    status: 'idle',
    error: null,
  },
  log: {
    entries: [],
    status: 'idle',
    error: null,
    filters: createDefaultFilters(),
    pagination: createDefaultPagination(),
    availableTypes: [],
    appliedSince: null,
  },
}

const buildLogRequestParams = (state) => {
  const { filters, pagination } = state
  const params = {
    limit: pagination.pageSize,
    offset: (pagination.page - 1) * pagination.pageSize,
  }

  const since = resolveSinceFromRange(filters.dateRange)
  if (since) {
    params.since = since
  }

  if (filters.actionTypes?.length) {
    params.type = filters.actionTypes
  }

  if (filters.search?.trim()) {
    params.search = filters.search.trim()
  }

  return params
}

const extractErrorMessage = (error) =>
  error.response?.data?.message ?? 'Failed to load activity history.'

export const fetchRecentAuditEntries = createAsyncThunk(
  'audit/fetchRecentAuditEntries',
  async (permitIdArg, { getState, rejectWithValue }) => {
    const { selectedPermitId } = getState().audit
    const permitId = permitIdArg ?? selectedPermitId

    if (!permitId) {
      return rejectWithValue('NO_PERMIT_SELECTED')
    }

    try {
      const params = {
        limit: 20,
      }
      const since = resolveSinceFromRange('30d')
      if (since) {
        params.since = since
      }
      const data = await getPermitActivity(permitId, params)
      return { permitId, actions: data.actions ?? [] }
    } catch (error) {
      return rejectWithValue(extractErrorMessage(error))
    }
  },
)

export const fetchAuditLogEntries = createAsyncThunk(
  'audit/fetchAuditLogEntries',
  async (permitIdArg, { getState, rejectWithValue }) => {
    const { log, selectedPermitId } = getState().audit
    const permitId = permitIdArg ?? selectedPermitId

    if (!permitId) {
      return rejectWithValue('NO_PERMIT_SELECTED')
    }

    try {
      const params = buildLogRequestParams(log)
      const data = await getPermitActivity(permitId, params)
      return {
        permitId,
        actions: data.actions ?? [],
        pagination:
          data.pagination ?? {
            total: data.actions?.length ?? 0,
            limit: params.limit,
            offset: params.offset,
            hasMore: false,
          },
        availableTypes: data.facets?.types ?? [],
        appliedFilters: {
          since: data.filters?.since ?? params.since ?? null,
        },
      }
    } catch (error) {
      return rejectWithValue(extractErrorMessage(error))
    }
  },
)

const auditSlice = createSlice({
  name: 'audit',
  initialState,
  reducers: {
    setAuditSelectedPermit: (state, action) => {
      state.selectedPermitId = action.payload ?? null
      state.recent.entries = []
      state.recent.status = 'idle'
      state.recent.error = null
      state.log.entries = []
      state.log.status = 'idle'
      state.log.error = null
      state.log.availableTypes = []
      state.log.appliedSince = null
      state.log.pagination = {
        ...state.log.pagination,
        page: 1,
        total: 0,
        hasMore: false,
      }
    },
    updateAuditLogFilters: (state, action) => {
      state.log.filters = {
        ...state.log.filters,
        ...action.payload,
      }
      state.log.pagination.page = 1
    },
    resetAuditLogFilters: (state) => {
      state.log.filters = createDefaultFilters()
      state.log.pagination.page = 1
    },
    setAuditLogPage: (state, action) => {
      state.log.pagination.page = action.payload
    },
    setAuditLogPageSize: (state, action) => {
      state.log.pagination.pageSize = action.payload
      state.log.pagination.page = 1
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRecentAuditEntries.pending, (state) => {
        state.recent.status = 'loading'
        state.recent.error = null
      })
      .addCase(fetchRecentAuditEntries.fulfilled, (state, action) => {
        if (action.payload.permitId !== state.selectedPermitId) {
          return
        }
        state.recent.status = 'succeeded'
        state.recent.entries = action.payload.actions
      })
      .addCase(fetchRecentAuditEntries.rejected, (state, action) => {
        if (action.payload === 'NO_PERMIT_SELECTED') {
          state.recent.status = 'idle'
          state.recent.error = null
          state.recent.entries = []
          return
        }
        state.recent.status = 'failed'
        state.recent.error = action.payload
      })
      .addCase(fetchAuditLogEntries.pending, (state) => {
        state.log.status = 'loading'
        state.log.error = null
      })
      .addCase(fetchAuditLogEntries.fulfilled, (state, action) => {
        if (action.payload.permitId !== state.selectedPermitId) {
          return
        }
        state.log.status = 'succeeded'
        state.log.entries = action.payload.actions
        state.log.pagination.total = action.payload.pagination.total ?? 0
        state.log.pagination.hasMore = Boolean(
          action.payload.pagination.hasMore,
        )
        state.log.availableTypes = action.payload.availableTypes
        state.log.appliedSince = action.payload.appliedFilters?.since ?? null
      })
      .addCase(fetchAuditLogEntries.rejected, (state, action) => {
        if (action.payload === 'NO_PERMIT_SELECTED') {
          state.log.status = 'idle'
          state.log.error = null
          state.log.entries = []
          state.log.pagination.total = 0
          state.log.pagination.hasMore = false
          state.log.availableTypes = []
          state.log.appliedSince = null
          return
        }
        state.log.status = 'failed'
        state.log.error = action.payload
      })
  },
})

export const {
  setAuditSelectedPermit,
  updateAuditLogFilters,
  resetAuditLogFilters,
  setAuditLogPage,
  setAuditLogPageSize,
} = auditSlice.actions

export const selectRecentAuditLogEntries = (state) => state.audit.recent.entries
export const selectRecentAuditStatus = (state) => state.audit.recent.status
export const selectRecentAuditError = (state) => state.audit.recent.error

export const selectAuditLogEntries = (state) => state.audit.log.entries
export const selectAuditLogStatus = (state) => state.audit.log.status
export const selectAuditLogError = (state) => state.audit.log.error
export const selectAuditLogFilters = (state) => state.audit.log.filters
export const selectAuditLogPagination = (state) => state.audit.log.pagination
export const selectAuditLogAvailableTypes = (state) => state.audit.log.availableTypes
export const selectAuditLogAppliedSince = (state) => state.audit.log.appliedSince
export const selectAuditSelectedPermitId = (state) => state.audit.selectedPermitId

export default auditSlice.reducer

import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import {
  getPermitById,
  getPermits,
  invitePermitCollaborator,
  assignHdabTeamMember as assignHdabTeamMemberRequest,
  removeHdabTeamMember as removeHdabTeamMemberRequest,
  removePermitCollaborator,
  submitPermitReview,
  initiateDataIngress,
  confirmIngressUpload,
  assignDataHolder as assignDataHolderRequest,
  removeDataHolder as removeDataHolderRequest,
} from '../../api/permitsApi.js'
import { submitWorkspaceForReview } from '../../api/workspaceApi.js'

const initialState = {
  permits: [],
  selectedPermit: null,
  status: 'idle',
  error: null,
}

export const fetchPermits = createAsyncThunk(
  'permits/fetchPermits',
  async (params, { rejectWithValue }) => {
    try {
      const data = await getPermits(params)
      return data
    } catch (error) {
      const message =
        error.response?.data?.message ?? 'Failed to load permits.'
      return rejectWithValue(message)
    }
  },
)

export const fetchPermitById = createAsyncThunk(
  'permits/fetchPermitById',
  async (permitId, { rejectWithValue }) => {
    try {
      const data = await getPermitById(permitId)
      return data
    } catch (error) {
      const message =
        error.response?.data?.message ?? 'Failed to load permit detail.'
      return rejectWithValue(message)
    }
  },
)

export const updatePermitStatus = createAsyncThunk(
  'permits/updatePermitStatus',
  async ({ permitId, body }, { rejectWithValue }) => {
    try {
      const data = await submitPermitReview(permitId, body)
      return data
    } catch (error) {
      const message =
        error.response?.data?.message ?? 'Failed to update permit status.'
      return rejectWithValue(message)
    }
  },
)

export const submitSetupForReview = createAsyncThunk(
  'permits/submitSetupForReview',
  async (permitId, { rejectWithValue }) => {
    try {
      const data = await submitWorkspaceForReview(permitId)
      return data
    } catch (error) {
      const message =
        error.response?.data?.message ??
        'Failed to submit workspace for review.'
      return rejectWithValue(message)
    }
  },
)

export const initiatePermitIngress = createAsyncThunk(
  'permits/initiatePermitIngress',
  async (permitId, { rejectWithValue }) => {
    try {
      const data = await initiateDataIngress(permitId)
      return data
    } catch (error) {
      const message =
        error.response?.data?.message ?? 'Failed to initiate data ingress.'
      return rejectWithValue(message)
    }
  },
)

export const confirmPermitIngressUpload = createAsyncThunk(
  'permits/confirmPermitIngressUpload',
  async (permitId, { rejectWithValue }) => {
    try {
      const data = await confirmIngressUpload(permitId)
      return data
    } catch (error) {
      const message =
        error.response?.data?.message ?? 'Failed to confirm upload.'
      return rejectWithValue(message)
    }
  },
)

export const inviteTeamMember = createAsyncThunk(
  'permits/inviteTeamMember',
  async ({ permitId, email }, { rejectWithValue }) => {
    try {
      const data = await invitePermitCollaborator(permitId, { email })
      return data
    } catch (error) {
      const message =
        error.response?.data?.message ?? 'Failed to invite collaborator.'
      return rejectWithValue(message)
    }
  },
)

export const removeTeamMember = createAsyncThunk(
  'permits/removeTeamMember',
  async ({ permitId, memberId }, { rejectWithValue }) => {
    try {
      const data = await removePermitCollaborator(permitId, memberId)
      return data
    } catch (error) {
      const message =
        error.response?.data?.message ?? 'Failed to remove collaborator.'
      return rejectWithValue(message)
    }
  },
)

export const assignHdabTeamMember = createAsyncThunk(
  'permits/assignHdabTeamMember',
  async ({ permitId, userId, permitRole }, { rejectWithValue }) => {
    try {
      const data = await assignHdabTeamMemberRequest(permitId, {
        userId,
        permitRole,
      })
      return data
    } catch (error) {
      const message =
        error.response?.data?.message ?? 'Failed to assign HDAB team member.'
      return rejectWithValue(message)
    }
  },
)

export const removeHdabTeamMember = createAsyncThunk(
  'permits/removeHdabTeamMember',
  async ({ permitId, userId, permitRole }, { rejectWithValue }) => {
    try {
      const data = await removeHdabTeamMemberRequest(
        permitId,
        userId,
        permitRole,
      )
      return data
    } catch (error) {
      const message =
        error.response?.data?.message ?? 'Failed to remove HDAB team member.'
      return rejectWithValue(message)
    }
  },
)

export const assignPermitDataHolder = createAsyncThunk(
  'permits/assignPermitDataHolder',
  async ({ permitId, payload }, { rejectWithValue }) => {
    try {
      const data = await assignDataHolderRequest(permitId, payload)
      return data
    } catch (error) {
      const message =
        error.response?.data?.message ?? 'Failed to assign data holder.'
      return rejectWithValue(message)
    }
  },
)

export const removePermitDataHolder = createAsyncThunk(
  'permits/removePermitDataHolder',
  async ({ permitId, holderId }, { rejectWithValue }) => {
    try {
      const data = await removeDataHolderRequest(permitId, holderId)
      return data
    } catch (error) {
      const message =
        error.response?.data?.message ?? 'Failed to remove data holder.'
      return rejectWithValue(message)
    }
  },
)

const permitsSlice = createSlice({
  name: 'permits',
  initialState,
  reducers: {
    clearSelectedPermit: (state) => {
      state.selectedPermit = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPermits.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchPermits.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.permits = action.payload.permits
      })
      .addCase(fetchPermits.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(fetchPermitById.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchPermitById.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.selectedPermit = action.payload.permit
        const permitIndex = state.permits.findIndex(
          (permit) => permit.id === action.payload.permit.id,
        )
        if (permitIndex !== -1) {
          state.permits[permitIndex] = action.payload.permit
        }
      })
      .addCase(fetchPermitById.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(updatePermitStatus.pending, (state) => {
        state.status = 'loading'
      })
      .addCase(updatePermitStatus.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.selectedPermit = action.payload.permit
        state.permits = state.permits.map((permit) =>
          permit.id === action.payload.permit.id
            ? action.payload.permit
            : permit,
        )
      })
      .addCase(updatePermitStatus.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(submitSetupForReview.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(submitSetupForReview.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.selectedPermit = action.payload.permit
        state.permits = state.permits.map((permit) =>
          permit.id === action.payload.permit.id
            ? action.payload.permit
            : permit,
        )
      })
      .addCase(submitSetupForReview.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(initiatePermitIngress.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(initiatePermitIngress.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.selectedPermit = action.payload.permit
        state.permits = state.permits.map((permit) =>
          permit.id === action.payload.permit.id
            ? action.payload.permit
            : permit,
        )
      })
      .addCase(initiatePermitIngress.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(confirmPermitIngressUpload.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(confirmPermitIngressUpload.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.selectedPermit = action.payload.permit
        state.permits = state.permits.map((permit) =>
          permit.id === action.payload.permit.id
            ? action.payload.permit
            : permit,
        )
      })
      .addCase(confirmPermitIngressUpload.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(inviteTeamMember.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(inviteTeamMember.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.selectedPermit = action.payload.permit
        state.permits = state.permits.map((permit) =>
          permit.id === action.payload.permit.id
            ? action.payload.permit
            : permit,
        )
      })
      .addCase(inviteTeamMember.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(removeTeamMember.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(removeTeamMember.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.selectedPermit = action.payload.permit
        state.permits = state.permits.map((permit) =>
          permit.id === action.payload.permit.id
            ? action.payload.permit
            : permit,
        )
      })
      .addCase(removeTeamMember.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(assignHdabTeamMember.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(assignHdabTeamMember.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.selectedPermit = action.payload.permit
        state.permits = state.permits.map((permit) =>
          permit.id === action.payload.permit.id
            ? action.payload.permit
            : permit,
        )
      })
      .addCase(assignHdabTeamMember.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(removeHdabTeamMember.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(removeHdabTeamMember.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.selectedPermit = action.payload.permit
        state.permits = state.permits.map((permit) =>
          permit.id === action.payload.permit.id
            ? action.payload.permit
            : permit,
        )
      })
      .addCase(removeHdabTeamMember.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(assignPermitDataHolder.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(assignPermitDataHolder.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.selectedPermit = action.payload.permit
        state.permits = state.permits.map((permit) =>
          permit.id === action.payload.permit.id
            ? action.payload.permit
            : permit,
        )
      })
      .addCase(assignPermitDataHolder.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(removePermitDataHolder.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(removePermitDataHolder.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.selectedPermit = action.payload.permit
        state.permits = state.permits.map((permit) =>
          permit.id === action.payload.permit.id
            ? action.payload.permit
            : permit,
        )
      })
      .addCase(removePermitDataHolder.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
  },
})

export const { clearSelectedPermit } = permitsSlice.actions

export const selectPermitsList = (state) => state.permits.permits
export const selectPermitDetail = (state) => state.permits.selectedPermit
export const selectPermitsStatus = (state) => state.permits.status
export const selectPermitsError = (state) => state.permits.error

export default permitsSlice.reducer

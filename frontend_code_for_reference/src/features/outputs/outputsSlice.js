import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { getOutputsForPermit } from '../../api/outputsApi.js'

const initialState = {
  byPermitId: {},
}

export const fetchPermitOutputs = createAsyncThunk(
  'outputs/fetchPermitOutputs',
  async (permitId, { rejectWithValue }) => {
    try {
      const data = await getOutputsForPermit(permitId)
      return { permitId, ...data }
    } catch (error) {
      const message =
        error.response?.data?.message ?? 'Failed to load output submissions.'
      return rejectWithValue(message)
    }
  },
)

const outputsSlice = createSlice({
  name: 'outputs',
  initialState,
  reducers: {
    clearPermitOutputs: (state, action) => {
      if (action.payload) {
        delete state.byPermitId[action.payload]
      } else {
        state.byPermitId = {}
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPermitOutputs.pending, (state, action) => {
        const permitId = action.meta.arg
        const existing = state.byPermitId[permitId] ?? {
          items: [],
          summary: null,
        }

        state.byPermitId[permitId] = {
          ...existing,
          status: 'loading',
          error: null,
        }
      })
      .addCase(fetchPermitOutputs.fulfilled, (state, action) => {
        const { permitId, outputs, summary } = action.payload
        state.byPermitId[permitId] = {
          items: outputs ?? [],
          summary: summary ?? null,
          status: 'succeeded',
          error: null,
        }
      })
      .addCase(fetchPermitOutputs.rejected, (state, action) => {
        const permitId = action.meta.arg
        const existing = state.byPermitId[permitId] ?? {
          items: [],
          summary: null,
        }

        state.byPermitId[permitId] = {
          ...existing,
          status: 'failed',
          error: action.payload ?? 'Failed to load output submissions.',
        }
      })
  },
})

export const { clearPermitOutputs } = outputsSlice.actions

export const selectOutputsByPermit = (state, permitId) =>
  state.outputs.byPermitId[permitId]?.items ?? []

export const selectOutputsSummaryByPermit = (state, permitId) =>
  state.outputs.byPermitId[permitId]?.summary ?? null

export const selectOutputsStatusByPermit = (state, permitId) =>
  state.outputs.byPermitId[permitId]?.status ?? 'idle'

export const selectOutputsErrorByPermit = (state, permitId) =>
  state.outputs.byPermitId[permitId]?.error ?? null

export default outputsSlice.reducer

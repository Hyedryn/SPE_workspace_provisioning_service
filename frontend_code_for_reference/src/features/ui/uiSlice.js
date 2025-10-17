import { createSlice, nanoid } from '@reduxjs/toolkit'

const initialState = {
  isSidebarOpen: true,
  notifications: [],
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.isSidebarOpen = !state.isSidebarOpen
    },
    addNotification: {
      reducer: (state, action) => {
        state.notifications.push(action.payload)
      },
      prepare: ({ message, severity = 'info' }) => ({
        payload: {
          id: nanoid(),
          message,
          severity,
          createdAt: new Date().toISOString(),
        },
      }),
    },
    removeNotification: (state, action) => {
      state.notifications = state.notifications.filter(
        (notification) => notification.id !== action.payload,
      )
    },
  },
})

export const { toggleSidebar, addNotification, removeNotification } =
  uiSlice.actions

export const selectIsSidebarOpen = (state) => state.ui.isSidebarOpen
export const selectNotifications = (state) => state.ui.notifications

export default uiSlice.reducer

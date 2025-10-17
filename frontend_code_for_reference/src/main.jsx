import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { Box, CircularProgress, CssBaseline, ThemeProvider } from '@mui/material'
import './index.css'
import App from './App.jsx'
import { store } from './app/store.js'
import { theme } from './theme.js'
import { I18nextProvider } from 'react-i18next'
import i18n from './i18n.js'

const rootElement = document.getElementById('root')
const root = createRoot(rootElement)

const enableMocking = async () => {
  if (!import.meta.env.DEV) {
    return
  }

  const { worker } = await import('./mocks/browser.js')
  await worker.start({ onUnhandledRequest: 'bypass' })
}

enableMocking().finally(() => {
  root.render(
    <StrictMode>
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <I18nextProvider i18n={i18n}>
            <Suspense
              fallback={
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '100vh',
                  }}
                >
                  <CircularProgress />
                </Box>
              }
            >
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </Suspense>
          </I18nextProvider>
        </ThemeProvider>
      </Provider>
    </StrictMode>,
  )
})

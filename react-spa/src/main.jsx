import './lib/sentry.js' // first: error reporting must be up before anything else can throw
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts.js' // T-6.5/W-41: self-hosted Inter + Material Symbols
import './index.css'
import App from './App.jsx'
import { QueryProvider } from './data/QueryProvider'
import { ToastProvider } from './ui'

// Stale-chunk recovery (plan 4.1): after a deploy the hashed lazy-route
// chunks an open tab still references are gone, and the next navigation
// fails with `vite:preloadError`. One reload picks up the new index.html;
// the sessionStorage timestamp stops a reload loop if the new build is
// broken too (a second failure within the window falls through to the
// route error boundary instead).
const RELOAD_GUARD_KEY = 'bikelab.chunkReloadAt'
const RELOAD_GUARD_WINDOW_MS = 30_000
window.addEventListener('vite:preloadError', (event) => {
  let reloadedRecently = false
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY))
    reloadedRecently = Date.now() - last < RELOAD_GUARD_WINDOW_MS
    if (!reloadedRecently) sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
  } catch {
    // storage blocked: reload anyway, the loop guard is best effort
  }
  if (reloadedRecently) return
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryProvider>
  </StrictMode>,
)

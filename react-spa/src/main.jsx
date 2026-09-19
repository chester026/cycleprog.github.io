import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts.js' // T-6.5/W-41: self-hosted Inter + Material Symbols
import './index.css'
import App from './App.jsx'
import { QueryProvider } from './data/QueryProvider'
import { ToastProvider } from './ui'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryProvider>
  </StrictMode>,
)

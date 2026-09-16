import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : []
  },
  build: {
    chunkSizeWarningLimit: 1000
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/img': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      }
    }
  }
}))

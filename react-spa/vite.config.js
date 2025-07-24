import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          charts: ['chart.js', 'react-chartjs-2', 'recharts'],
          maps: ['leaflet', 'react-leaflet', '@mapbox/polyline'],
          utils: ['jwt-decode', 'html2canvas', 'gpxparser']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  },
  server: {
    proxy: {
      '/activities': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/exchange_token': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
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
})

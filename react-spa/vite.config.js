import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : []
  },
  resolve: {
    // Dev-only: point @bikelab/shared at its source so edits hot-reload
    // without a `tsup` rebuild. Production build resolves the package's
    // built `dist` via its `exports` map instead (see packages/shared/README.md).
    alias: mode !== 'production'
      ? [
          { find: /^@bikelab\/shared$/, replacement: path.resolve(__dirname, '../packages/shared/src/index.ts') },
          { find: /^@bikelab\/shared\/(.*)$/, replacement: path.resolve(__dirname, '../packages/shared/src/$1/index.ts') }
        ]
      : []
  },
  optimizeDeps: {
    exclude: ['@bikelab/shared']
  },
  build: {
    chunkSizeWarningLimit: 1000
  },
  server: {
    fs: {
      allow: ['..']
    },
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

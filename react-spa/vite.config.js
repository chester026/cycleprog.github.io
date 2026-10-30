import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Build identity for the TanStack persister buster (src/data/queryClient.js):
// the git short sha when available, else the build time — either way it
// changes on every deploy, which `package.json` version never did.
function buildHash() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return String(Date.now())
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    __BUILD_HASH__: JSON.stringify(buildHash())
  },
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
    // Hidden maps: emitted for the Sentry upload step, never referenced from
    // the served JS (plan 4.1). Vendor chunks keep the index chunk small and
    // let recharts/leaflet cache across deploys that only touch app code.
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/recharts/') || id.includes('/d3-') || id.includes('/victory-vendor/')) return 'recharts'
          if (id.includes('/leaflet/') || id.includes('/react-leaflet/') || id.includes('/@react-leaflet/')) return 'leaflet'
          if (id.includes('/@tanstack/')) return 'tanstack'
          if (id.includes('/@sentry/')) return 'sentry'
          return undefined
        }
      }
    }
  },
  server: {
    fs: {
      allow: ['..']
    },
    proxy: {
      // e2e only (react-spa/e2e/global-setup.cjs): the coach chat stream is
      // served by a scripted SSE mock instead of the API, so the Playwright
      // suite never reaches OpenAI. Listed before '/api' so it wins.
      ...(process.env.VITE_E2E_COACH_STREAM
        ? { '/api/coach/chat': { target: process.env.VITE_E2E_COACH_STREAM, changeOrigin: true } }
        : {}),
      '/api': {
        // T-6.5 (audit W-38..W-41): e2e/global-setup.cjs boots the API on a
        // scratch port and passes it here so the Playwright smoke suite's
        // Vite instance proxies to that instance instead of :8080.
        target: process.env.VITE_API_PROXY || 'http://localhost:8080',
        changeOrigin: true,
      },
      '/img': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      }
    }
  }
}))

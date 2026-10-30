// Phase 6 (docs/audit/00-AUDIT-AND-PLAN.md T-6.5): vitest for the web app.
// `jsdom` so components/hooks can be rendered with @testing-library/react;
// pure utils still run fine in it. Tests live next to their code as
// `*.test.js(x)` or under `__tests__/`.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  // Same injected constant vite.config.js defines for the real build.
  define: {
    __BUILD_HASH__: JSON.stringify('test'),
  },
  // Same JSX runtime as vite.config.js's `react()` plugin, so components
  // that rely on it (no `import React`, e.g. pages/analysis/*, pages/landing/*)
  // are testable instead of failing with "React is not defined".
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: [
      { find: /^@bikelab\/shared$/, replacement: path.resolve(__dirname, '../packages/shared/src/index.ts') },
      { find: /^@bikelab\/shared\/(.*)$/, replacement: path.resolve(__dirname, '../packages/shared/src/$1/index.ts') },
    ],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}', 'src/**/__tests__/**/*.test.{js,jsx}'],
    passWithNoTests: true,
    css: false,
    // `npm run test:coverage` (v8). Tests and the setup file are not
    // "code under test"; main.jsx only wires the root.
    coverage: {
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/**/*.test.{js,jsx}', 'src/**/__tests__/**', 'src/test/**', 'src/main.jsx'],
      reporter: ['text-summary', 'html'],
    },
  },
};

// Phase 6 (docs/audit/00-AUDIT-AND-PLAN.md T-6.5): vitest for the web app.
// `jsdom` so components/hooks can be rendered with @testing-library/react;
// pure utils still run fine in it. Tests live next to their code as
// `*.test.js(x)` or under `__tests__/`.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
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
  },
};

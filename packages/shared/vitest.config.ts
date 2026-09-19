// T-7.2: enforces 100% coverage (statements/branches/functions/lines) on
// packages/shared/src/calc/** — the pure ride-physics/skills/goal-progress
// calculators. Requires `@vitest/coverage-v8` (see package.json
// devDependencies / the T-7.2 report for install status).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/calc/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/calc/index.ts'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});

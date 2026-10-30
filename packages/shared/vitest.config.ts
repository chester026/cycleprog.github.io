// T-7.2: enforces 100% coverage (statements/branches/functions/lines) on
// packages/shared/src/calc/** — the pure ride-physics/skills/goal-progress
// calculators — on src/coach/**, the chat logic both clients render cards
// from — and on src/checklist/**, the checklist derivations both clients
// use — and on src/calendar/**, the date math and `.ics` builder. Requires `@vitest/coverage-v8`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/calc/**/*.ts', 'src/coach/**/*.ts', 'src/checklist/**/*.ts', 'src/calendar/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/calc/index.ts', 'src/coach/index.ts', 'src/checklist/index.ts', 'src/calendar/index.ts'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});

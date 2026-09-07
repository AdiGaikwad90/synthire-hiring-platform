import path from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Frontend logic tests only — NO component rendering.
 *
 * Per TESTING.md tier D, .tsx components are exempt: they need a DOM harness
 * that costs more than it returns while typecheck plus the manual browser pass
 * cover them. What IS tested here is the logic bugs hide in: the API client's
 * 401-refresh coalescing, token storage, middleware route gating, and the
 * shared formatters.
 */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    name: 'frontend-logic',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary'],
      include: ['lib/**/*.ts', 'middleware.ts'],
      exclude: ['lib/icons.tsx', 'lib/types.ts'],
      thresholds: {
        'lib/utils.ts': { statements: 100, branches: 95, functions: 100, lines: 100 },
      },
    },
  },
})

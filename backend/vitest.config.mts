import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'

// Read once at config time (Node side). applyD1Migrations() then runs them
// inside workerd via tests/setup/migrate.ts.
const migrations = await readD1Migrations(path.join(__dirname, 'src/db/migrations'))

/**
 * Test projects
 * ─────────────
 * unit        — pure logic, plain Node. No bindings, no I/O. Milliseconds.
 * integration — runs inside workerd. env.DB / env.KV_CACHE / env.RESUME_BUCKET
 *               are REAL implementations backed by local storage (SQLite for
 *               D1), not mocks — which is the point: `toJob()`'s JSON handling
 *               and the email queue's atomic UPDATE...RETURNING are SQLite
 *               semantics that a mock cannot reproduce.
 *
 * env.AI and env.VECTORIZE have NO local simulator in Miniflare (they only
 * accept a remote proxy connection), so they are absent here and must be
 * stubbed by the test. Anything needing them stays in the unit project with a
 * hand-written stub.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: './wrangler.test.toml' },
            miniflare: {
              // Surfaced to tests as env.TEST_MIGRATIONS.
              bindings: { TEST_MIGRATIONS: migrations },
            },
          }),
        ],
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['./tests/setup/migrate.ts'],
        },
      },
    ],
    // Coverage instruments the UNIT project only: @vitest/coverage-v8 imports
    // node:inspector/promises, which workerd does not provide, so enabling it
    // for the integration project fails the run outright. Integration tests
    // therefore execute uninstrumented — their value is behavioural (real
    // SQLite semantics), not a coverage number. `npm run test:coverage` scopes
    // itself with --project unit for this reason.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/types/**',            // type-only declarations
        'src/db/migrations/**',    // SQL
        'src/index.ts',            // wiring; covered by Phase 3 route tests
        'src/**/*.d.ts',
      ],
      // Floors set to what the suite ACTUALLY reaches, not to aspirations — a
      // threshold above real coverage just gets deleted the first time it goes
      // red. Per-file on purpose: a directory glob would average pure logic
      // together with binding-dependent modules.
      //
      // Ratchet these up as later phases add coverage. Never down.
      thresholds: {
        'src/services/scoring/aggregator.ts': { statements: 100, branches: 95, functions: 100, lines: 100 },
        'src/services/scoring/dimensions.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/services/scoring/skill-matcher.ts': { statements: 100, branches: 93, functions: 100, lines: 100 },
        'src/services/embeddings/similarity.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/services/parsing/detector.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/utils/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/services/budget/**': { statements: 80, branches: 65, functions: 80, lines: 80 },
      },
    },
  },
})

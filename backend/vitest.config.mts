import { defineConfig } from 'vitest/config'

/**
 * Test projects
 * ─────────────
 * unit        — pure logic, plain Node. No Cloudflare bindings, no I/O. Fast.
 * integration — Phase 2: adds a second project using
 *               @cloudflare/vitest-pool-workers so tests run inside workerd
 *               with real (locally simulated) D1/KV/R2. env.AI and
 *               env.VECTORIZE have no local simulator and must be stubbed.
 *
 * Anything that needs `env` belongs in integration, not here. If a test in
 * `unit` starts needing a binding, that is the signal it is in the wrong place.
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
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/types/**',            // type-only declarations
        'src/db/migrations/**',    // SQL
        'src/index.ts',            // wiring; covered by integration tests later
        'src/**/*.d.ts',
      ],
      // Floors set to what the suite ACTUALLY reaches, not to aspirations — a
      // threshold above real coverage just gets deleted the first time it goes
      // red. These are per-file on purpose: a directory glob would average
      // pure logic together with binding-dependent modules like
      // scoring/pipeline.ts, which cannot be unit tested and lands in Phase 2.
      //
      // Ratchet these up as Phases 2-4 add integration coverage. Never down.
      thresholds: {
        // Phase 1 — fully covered pure logic. Any drop is a real regression.
        'src/services/scoring/aggregator.ts': { statements: 100, branches: 95, functions: 100, lines: 100 },
        'src/services/scoring/dimensions.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/services/scoring/skill-matcher.ts': { statements: 100, branches: 93, functions: 100, lines: 100 },
        'src/services/embeddings/similarity.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/services/parsing/detector.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/utils/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
        // Partially covered — the remainder needs real bindings (Phase 2).
        'src/services/budget/**': { statements: 80, branches: 65, functions: 80, lines: 80 },
      },
    },
  },
})

import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll } from 'vitest'

/**
 * Applies src/db/migrations/*.sql to the local test D1 before any integration
 * test runs, so tests exercise the real schema — real NOT NULL constraints,
 * real UNIQUE indexes, real SQLite type affinity.
 *
 * The migration list is injected as env.TEST_MIGRATIONS by vitest.config.mts.
 */
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

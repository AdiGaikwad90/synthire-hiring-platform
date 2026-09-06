import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { Env as WorkerEnv } from '../src/types/bindings'

// `env` from "cloudflare:test" is typed as Cloudflare.Env. Widen it to our
// Worker's bindings plus the migration list injected by vitest.config.mts.
declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

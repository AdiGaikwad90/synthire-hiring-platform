/**
 * Per-request usage meters for D1 and KV.
 *
 * Both are Proxies wrapped around the real bindings in src/index.ts, before
 * Hono sees the env. That way all ~81 `.prepare()` sites and every
 * `KV_CACHE.get/put` are counted with no call-site changes, and nothing
 * mutates the isolate-shared `env` object (a fresh env is spread per request).
 */

import type { D1Database, D1PreparedStatement, KVNamespace } from '@cloudflare/workers-types'

export interface UsageTally {
  d1RowsRead: number
  d1RowsWritten: number
  kvReads: number
  kvWrites: number
}

export function newTally(): UsageTally {
  return { d1RowsRead: 0, d1RowsWritten: 0, kvReads: 0, kvWrites: 0 }
}

/** D1 reports real row counts in `meta` — use them rather than guessing. */
function addMeta(tally: UsageTally, result: unknown): void {
  const meta = (result as { meta?: { rows_read?: number; rows_written?: number } } | null)?.meta
  if (!meta) return
  tally.d1RowsRead += meta.rows_read ?? 0
  tally.d1RowsWritten += meta.rows_written ?? 0
}

function meterStatement(stmt: D1PreparedStatement, tally: UsageTally): D1PreparedStatement {
  return new Proxy(stmt, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function') return value

      // bind() returns a new statement — keep it metered.
      if (prop === 'bind') {
        return (...args: unknown[]) =>
          meterStatement((value as (...a: unknown[]) => D1PreparedStatement).apply(target, args), tally)
      }

      if (prop === 'run' || prop === 'all' || prop === 'first' || prop === 'raw') {
        return async (...args: unknown[]) => {
          const out = await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args)
          // `first()`/`raw()` resolve to plain values with no meta; those rows
          // are still counted by D1 upstream, we just cannot see them here.
          addMeta(tally, out)
          return out
        }
      }

      return (value as (...a: unknown[]) => unknown).bind(target)
    },
  })
}

export function meterD1(db: D1Database, tally: UsageTally): D1Database {
  return new Proxy(db, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function') return value

      if (prop === 'prepare') {
        return (...args: unknown[]) =>
          meterStatement((value as (...a: unknown[]) => D1PreparedStatement).apply(target, args), tally)
      }

      if (prop === 'batch') {
        return async (...args: unknown[]) => {
          const out = await (value as (...a: unknown[]) => Promise<unknown[]>).apply(target, args)
          if (Array.isArray(out)) out.forEach((r) => addMeta(tally, r))
          return out
        }
      }

      return (value as (...a: unknown[]) => unknown).bind(target)
    },
  })
}

export function meterKV(kv: KVNamespace, tally: UsageTally): KVNamespace {
  return new Proxy(kv, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function') return value

      // getWithMetadata counts as a read; delete and list are not billed the
      // same way as writes on the free plan, so only get/put are tallied.
      if (prop === 'get' || prop === 'getWithMetadata') {
        return (...args: unknown[]) => {
          tally.kvReads += 1
          return (value as (...a: unknown[]) => unknown).apply(target, args)
        }
      }

      if (prop === 'put') {
        return (...args: unknown[]) => {
          tally.kvWrites += 1
          return (value as (...a: unknown[]) => unknown).apply(target, args)
        }
      }

      return (value as (...a: unknown[]) => unknown).bind(target)
    },
  })
}

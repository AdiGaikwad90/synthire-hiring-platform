import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'

describe('integration environment', () => {
  it('exposes real D1, KV and R2 bindings', () => {
    expect(env.DB).toBeDefined()
    expect(env.KV_CACHE).toBeDefined()
    expect(env.RESUME_BUCKET).toBeDefined()
  })

  it('has the schema applied by the migration setup', async () => {
    const row = await env.DB
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'")
      .first<{ name: string }>()
    expect(row?.name).toBe('jobs')
  })
})

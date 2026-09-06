import { describe, it, expect } from 'vitest'
import type { KVNamespace } from '@cloudflare/workers-types'
import {
  checkNeuronBudget,
  deductNeurons,
  buildNeuronLimitConfig,
  NEURON_COSTS,
} from '../../../../src/services/budget/neurons'
import type { Env } from '../../../../src/types/bindings'

// Minimal KV stand-in — checkNeuronBudget only needs get/put.
function stubKV(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed))
  return {
    kv: {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => void store.set(k, v),
    } as unknown as KVNamespace,
    store,
  }
}

const today = () => `neurons:daily:${new Date().toISOString().slice(0, 10)}`

describe('buildNeuronLimitConfig', () => {
  it('defaults to enabled with a 10000 limit when unset', () => {
    expect(buildNeuronLimitConfig({} as Env)).toEqual({ enabled: true, dailyLimit: 10000 })
  })

  // Fail-CLOSED: only an explicit "false" disables. A typo must never silently
  // uncap billing — see isGuardrailEnabled in src/utils/env.ts.
  it('disables only on an explicit "false", case-insensitive and trimmed', () => {
    const at = (v: string) => buildNeuronLimitConfig({ LLM_LIMITS_ENABLED: v } as Env).enabled
    expect(at('false')).toBe(false)
    expect(at('False')).toBe(false)
    expect(at('  false  ')).toBe(false)
  })

  it('stays enabled for every non-"false" value, including typos and empties', () => {
    const at = (v: string) => buildNeuronLimitConfig({ LLM_LIMITS_ENABLED: v } as Env).enabled
    for (const v of ['true', 'True', '', '0', 'no', 'off', 'flase', 'yes']) {
      expect(at(v), `"${v}" must not disable the cap`).toBe(true)
    }
  })
})

describe('checkNeuronBudget', () => {
  it('allows a call when under the limit', async () => {
    const { kv } = stubKV({ [today()]: '0' })
    await expect(
      checkNeuronBudget(kv, 'LLM_PARSE', { enabled: true, dailyLimit: 10000 })
    ).resolves.toBeUndefined()
  })

  it('throws 503 when the cap is enabled and would be exceeded', async () => {
    const { kv } = stubKV({ [today()]: '9999' })
    await expect(
      checkNeuronBudget(kv, 'LLM_PARSE', { enabled: true, dailyLimit: 10000 })
    ).rejects.toMatchObject({ statusCode: 503 })
  })

  it('does NOT throw when the kill switch is off, even far past the cap', async () => {
    const { kv } = stubKV({ [today()]: '999999' })
    await expect(
      checkNeuronBudget(kv, 'LLM_PARSE', { enabled: false, dailyLimit: 10000 })
    ).resolves.toBeUndefined()
  })

  it('is a boundary, not an off-by-one: exactly hitting the limit is allowed', async () => {
    const under = 10000 - NEURON_COSTS.LLM_PARSE
    const { kv } = stubKV({ [today()]: String(under) })
    await expect(
      checkNeuronBudget(kv, 'LLM_PARSE', { enabled: true, dailyLimit: 10000 })
    ).resolves.toBeUndefined()

    const { kv: kv2 } = stubKV({ [today()]: String(under + 1) })
    await expect(
      checkNeuronBudget(kv2, 'LLM_PARSE', { enabled: true, dailyLimit: 10000 })
    ).rejects.toMatchObject({ statusCode: 503 })
  })

  it('treats a missing/corrupt counter as zero rather than NaN', async () => {
    const { kv } = stubKV({}) // no key at all
    await expect(
      checkNeuronBudget(kv, 'LLM_SCORE', { enabled: true, dailyLimit: 200 })
    ).resolves.toBeUndefined()
  })
})

describe('deductNeurons', () => {
  it('keeps counting while the kill switch is off, so usage stays observable', async () => {
    const { kv, store } = stubKV({ [today()]: '500' })
    // Disabled config is never passed to deduct — it counts unconditionally.
    await deductNeurons(kv, 'LLM_SCORE')
    expect(store.get(today())).toBe(String(500 + NEURON_COSTS.LLM_SCORE))
  })
})

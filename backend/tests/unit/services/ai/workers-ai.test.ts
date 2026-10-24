import { describe, it, expect } from 'vitest'
import type { Ai } from '@cloudflare/workers-types'
import { callWorkersAI } from '../../../../src/services/ai/workers-ai'

/**
 * Workers AI models do not share one response shape. Llama models return
 * `{ response }`; gpt-oss returns an OpenAI chat-completions object with no
 * `response` field at all. Reading only `response` made gpt-oss look like an
 * empty reply, which would silently push every call to the fallback model.
 */

const fakeAi = (result: unknown) => ({ run: async () => result }) as unknown as Ai
const req = { messages: [{ role: 'user' as const, content: 'hi' }] }

describe('callWorkersAI — happy path', () => {
  it('reads the Llama-style `response` string', async () => {
    const r = await callWorkersAI(fakeAi({ response: '{"a":1}', finish_reason: 'stop' }), 'm', req)
    expect(r).toEqual({ content: '{"a":1}', finishReason: 'stop' })
  })
})

describe('callWorkersAI — positive variants', () => {
  it('reads the chat-completions shape gpt-oss returns', async () => {
    const r = await callWorkersAI(
      fakeAi({ choices: [{ message: { content: '{"b":2}' }, finish_reason: 'length' }] }),
      'm',
      req,
    )
    expect(r).toEqual({ content: '{"b":2}', finishReason: 'length' })
  })

  it('stringifies an already-parsed `response` object', async () => {
    const r = await callWorkersAI(fakeAi({ response: { c: 3 } }), 'm', req)
    expect(r.content).toBe('{"c":3}')
  })

  it('prefers `response` when a model returns both shapes', async () => {
    const r = await callWorkersAI(
      fakeAi({ response: 'from-response', choices: [{ message: { content: 'from-choices' } }] }),
      'm',
      req,
    )
    expect(r.content).toBe('from-response')
  })
})

describe('callWorkersAI — empty / error contract', () => {
  it.each([
    ['nothing', {}],
    ['null', null],
    ['empty choices', { choices: [] }],
    ['null message content', { choices: [{ message: { content: null } }] }],
  ])('throws on %s so the fallback chain moves on', async (_n, result) => {
    await expect(callWorkersAI(fakeAi(result), 'm', req)).rejects.toThrow(/empty response/)
  })
})

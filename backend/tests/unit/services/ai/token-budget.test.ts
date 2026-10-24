import { describe, it, expect } from 'vitest'
import { MAX_TOKENS_BY_OPERATION, buildLlmConfig, buildScoringLlmConfig } from '../../../../src/services/ai/fallback'
import { NEURON_COSTS } from '../../../../src/services/budget/neurons'
import type { Env } from '../../../../src/types/bindings'

/**
 * Regression guard for a production failure.
 *
 * LLM_MAX_TOKENS was a single global 800. A parsed resume with several roles
 * and degrees needs far more than that, so the model was cut off mid-object and
 * the result came back as "returned invalid JSON" — which reads like a model
 * quality problem and is actually a budget problem. Job-description parsing
 * kept working because its output is small, which made the cause harder to see.
 *
 * These assertions fail if the budgets are lowered back toward that range.
 */

describe('MAX_TOKENS_BY_OPERATION', () => {
  it('covers every operation that spends Neurons', () => {
    for (const op of Object.keys(NEURON_COSTS)) {
      expect(MAX_TOKENS_BY_OPERATION, `missing budget for ${op}`).toHaveProperty(op)
    }
  })

  it('gives resume/JD parsing the largest budget — it emits the most JSON', () => {
    expect(MAX_TOKENS_BY_OPERATION.LLM_PARSE).toBeGreaterThanOrEqual(
      MAX_TOKENS_BY_OPERATION.LLM_SCORE,
    )
    expect(MAX_TOKENS_BY_OPERATION.LLM_PARSE).toBeGreaterThanOrEqual(
      MAX_TOKENS_BY_OPERATION.LLM_QUESTIONS,
    )
  })

  it('keeps LLM_PARSE well clear of the 800 that truncated resumes', () => {
    expect(MAX_TOKENS_BY_OPERATION.LLM_PARSE).toBeGreaterThanOrEqual(3000)
  })

  it('gives every generative operation a non-zero budget', () => {
    for (const op of ['LLM_PARSE', 'LLM_SCORE', 'LLM_QUESTIONS'] as const) {
      expect(MAX_TOKENS_BY_OPERATION[op], op).toBeGreaterThan(0)
    }
  })

  it('leaves EMBEDDING at 0 — it generates no tokens', () => {
    expect(MAX_TOKENS_BY_OPERATION.EMBEDDING).toBe(0)
  })

  it('gives LLM_SCORE room for up to 25 per-skill verdicts with evidence', () => {
    expect(MAX_TOKENS_BY_OPERATION.LLM_SCORE).toBeGreaterThanOrEqual(4000)
  })
})

describe('buildLlmConfig', () => {
  it('falls back to models that exist in the catalogue', () => {
    const c = buildLlmConfig({} as Env)
    // Workers AI removed llama-3.1-8b-instruct-awq on 2026-05-30; a dead name
    // fails with error 5028 rather than falling through.
    expect(c.models.join(',')).not.toContain('awq')
    expect(c.models).toHaveLength(2)
  })

  it('reads model names from env so a swap needs no code change', () => {
    const c = buildLlmConfig({
      LLM_MODEL_PRIMARY: '@cf/x/primary',
      LLM_MODEL_FALLBACK: '@cf/x/fallback',
    } as Env)
    expect(c.models).toEqual(['@cf/x/primary', '@cf/x/fallback'])
  })

  it('parses temperature and maxTokens, with sane defaults', () => {
    expect(buildLlmConfig({} as Env).temperature).toBeCloseTo(0.1)
    const c = buildLlmConfig({ LLM_TEMPERATURE: '0.7', LLM_MAX_TOKENS: '1234' } as Env)
    expect(c.temperature).toBeCloseTo(0.7)
    expect(c.maxTokens).toBe(1234)
  })
})

// Scoring has its own models. Picked by a live benchmark (two resumes x 3 runs):
// gpt-oss-120b got 18/18 skill verdicts right with identical output each run, for
// ~105 Neurons a resume; llama-3.3-70b got 16/18 for ~97; the 8B parse model got
// 9/12 and never produced a "transferable" verdict.
describe('buildScoringLlmConfig', () => {
  it('defaults to gpt-oss-120b with llama-3.3-70b as fallback', () => {
    expect(buildScoringLlmConfig({} as Env).models).toEqual([
      '@cf/openai/gpt-oss-120b',
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    ])
  })

  it('is independent of the parse models', () => {
    const c = buildScoringLlmConfig({ LLM_MODEL_PRIMARY: '@cf/x/parse' } as Env)
    expect(c.models).not.toContain('@cf/x/parse')
  })

  it('reads its own env vars so a swap needs no code change', () => {
    const c = buildScoringLlmConfig({
      LLM_SCORE_MODEL_PRIMARY: '@cf/x/score',
      LLM_SCORE_MODEL_FALLBACK: '@cf/x/score-fb',
    } as Env)
    expect(c.models).toEqual(['@cf/x/score', '@cf/x/score-fb'])
  })

  it('keeps the shared temperature and token settings', () => {
    const c = buildScoringLlmConfig({ LLM_TEMPERATURE: '0.3', LLM_MAX_TOKENS: '999' } as Env)
    expect(c.temperature).toBeCloseTo(0.3)
    expect(c.maxTokens).toBe(999)
  })
})

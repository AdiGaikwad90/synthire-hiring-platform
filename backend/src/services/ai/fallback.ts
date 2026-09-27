import type { Ai } from '@cloudflare/workers-types'
import type { KVNamespace } from '@cloudflare/workers-types'
import { AppError } from '../../types/api'
import { callWorkersAI } from './workers-ai'
import type { WorkersAIRequest } from './workers-ai'
import type { Env } from '../../types/bindings'
import { checkNeuronBudget, deductNeurons } from '../budget/neurons'
import type { NeuronOperation, NeuronLimitConfig } from '../budget/neurons'

export interface LlmConfig {
  models: string[]
  temperature: number
  maxTokens: number
}

/**
 * Output budgets per operation. A single global max_tokens does not work here:
 * a parsed resume with several roles and degrees is far larger than a parsed
 * job description, and a budget sized for the small case truncates the large
 * one mid-object — which surfaces as "returned invalid JSON", not as an
 * obvious truncation.
 */
export const MAX_TOKENS_BY_OPERATION: Record<NeuronOperation, number> = {
  LLM_PARSE: 4000,
  LLM_SCORE: 2000,
  LLM_QUESTIONS: 1500,
  EMBEDDING: 0,
}

const DEFAULT_CONFIG: LlmConfig = {
  // Keep in sync with wrangler.toml. Workers AI removes models (the -awq
  // variant was deprecated 2026-05-30); verify with `npx wrangler ai models`.
  models: ['@cf/meta/llama-3.1-8b-instruct-fp8', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
  temperature: 0.1,
  maxTokens: 2000,
}

export function buildLlmConfig(env: Env): LlmConfig {
  return {
    models: [
      env.LLM_MODEL_PRIMARY  ?? '@cf/meta/llama-3.1-8b-instruct-fp8',
      env.LLM_MODEL_FALLBACK ?? '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    ],
    temperature: parseFloat(env.LLM_TEMPERATURE ?? '0.1'),
    maxTokens: parseInt(env.LLM_MAX_TOKENS ?? '2000', 10),
  }
}

// Strip markdown code fences and find the first {...} or [...] JSON object in the response.
// Many smaller models wrap their JSON in ```json ... ``` or add prose before/after.
export function extractJson(raw: string): string {
  // Remove ```json ... ``` or ``` ... ``` fences
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) return fenceMatch[1].trim()

  // Find first { or [ and last matching } or ]
  const start = raw.search(/[{[]/)
  if (start === -1) return raw
  const isArray = raw[start] === '['
  const close = isArray ? raw.lastIndexOf(']') : raw.lastIndexOf('}')
  if (close === -1 || close <= start) return raw
  return raw.slice(start, close + 1)
}

export async function callWithFallback(
  ai: Ai,
  kv: KVNamespace,
  neuronConfig: NeuronLimitConfig,
  messages: WorkersAIRequest['messages'],
  validateFn: (parsed: unknown) => boolean,
  operation: NeuronOperation,
  config: LlmConfig = DEFAULT_CONFIG
): Promise<unknown> {
  // Hard stop — check budget before attempting any model
  await checkNeuronBudget(kv, operation, neuronConfig)

  const errors: string[] = []

  for (const model of config.models) {
    console.info(`[llm] trying model=${model}`)
    try {
      const budget = MAX_TOKENS_BY_OPERATION[operation] || config.maxTokens
      const { content, finishReason } = await callWorkersAI(ai, model, {
        messages,
        temperature: config.temperature,
        max_tokens: budget,
      })

      let parsed: unknown
      try {
        parsed = JSON.parse(extractJson(content))
      } catch {
        // Log WHY, not just THAT. finish_reason 'length' means the budget was
        // too small and the JSON is truncated — a different fix from a model
        // that simply wrapped its answer in prose.
        const truncated = finishReason === 'length'
        const detail = truncated
          ? `output hit the ${budget}-token budget and was truncated`
          : 'output was not parseable JSON'
        errors.push(`${model}: ${detail}`)
        console.warn(
          `[llm] model=${model} ${detail}; head=${JSON.stringify(content.slice(0, 160))}` +
            ` tail=${JSON.stringify(content.slice(-80))}`,
        )
        continue
      }

      if (validateFn(parsed)) {
        // Deduct Neurons only on success
        await deductNeurons(kv, operation)
        console.info(`[llm] success model=${model}`)
        return parsed
      }

      errors.push(`${model}: response failed schema validation`)
      console.warn(`[llm] model=${model} failed schema validation, trying next`)
    } catch (err) {
      // Re-throw budget errors immediately — do not try next model
      if (err instanceof AppError && err.statusCode === 503) throw err

      const message = err instanceof Error ? err.message : String(err)
      console.error(`[llm] model=${model} error:`, message)
      errors.push(`${model}: ${message}`)
    }
  }

  console.error('[llm] All models exhausted:', errors.join(' | '))
  throw new AppError('All AI models exhausted without a valid response', 503)
}

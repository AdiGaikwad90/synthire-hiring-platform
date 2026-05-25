import type { Ai } from '@cloudflare/workers-types'
import type { KVNamespace } from '@cloudflare/workers-types'
import { AppError } from '../../types/api'
import { callWorkersAI } from './workers-ai'
import type { WorkersAIRequest } from './workers-ai'
import type { Env } from '../../types/bindings'
import { checkNeuronBudget, deductNeurons } from '../budget/neurons'
import type { NeuronOperation } from '../budget/neurons'

export interface LlmConfig {
  models: string[]
  temperature: number
  maxTokens: number
}

const DEFAULT_CONFIG: LlmConfig = {
  models: ['@cf/meta/llama-3.1-8b-instruct', '@cf/meta/llama-3.2-3b-instruct'],
  temperature: 0.1,
  maxTokens: 2000,
}

export function buildLlmConfig(env: Env): LlmConfig {
  return {
    models: [
      env.LLM_MODEL_PRIMARY  ?? '@cf/meta/llama-3.1-8b-instruct',
      env.LLM_MODEL_FALLBACK ?? '@cf/meta/llama-3.2-3b-instruct',
    ],
    temperature: parseFloat(env.LLM_TEMPERATURE ?? '0.1'),
    maxTokens: parseInt(env.LLM_MAX_TOKENS ?? '2000', 10),
  }
}

export async function callWithFallback(
  ai: Ai,
  kv: KVNamespace,
  dailyLimit: number,
  messages: WorkersAIRequest['messages'],
  validateFn: (parsed: unknown) => boolean,
  operation: NeuronOperation,
  config: LlmConfig = DEFAULT_CONFIG
): Promise<unknown> {
  // Hard stop — check budget before attempting any model
  await checkNeuronBudget(kv, operation, dailyLimit)

  const errors: string[] = []

  for (const model of config.models) {
    console.info(`[llm] trying model=${model}`)
    try {
      const content = await callWorkersAI(ai, model, {
        messages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      })

      let parsed: unknown
      try {
        parsed = JSON.parse(content)
      } catch {
        errors.push(`${model}: returned invalid JSON`)
        console.warn(`[llm] model=${model} returned invalid JSON, trying next`)
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

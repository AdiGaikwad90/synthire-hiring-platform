import { AppError } from '../../types/api'
import { callOpenRouter } from './openrouter'
import type { OpenRouterRequest } from './openrouter'
import type { Env } from '../../types/bindings'

export interface LlmConfig {
  models: Array<{ model: string; maxRetries: number }>
  temperature: number
  maxTokens: number
}

// Default config used when no env is available (tests, edge cases)
const DEFAULT_CONFIG: LlmConfig = {
  models: [
    { model: 'meta-llama/llama-3.3-70b-instruct:free', maxRetries: 3 },
    { model: 'google/gemma-4-31b-it:free', maxRetries: 3 },
    { model: 'openai/gpt-4o-mini', maxRetries: 2 },
  ],
  temperature: 0.1,
  maxTokens: 2000,
}

export function buildLlmConfig(env: Env): LlmConfig {
  return {
    models: [
      { model: env.OPENROUTER_MODEL_PRIMARY ?? DEFAULT_CONFIG.models[0].model, maxRetries: 3 },
      { model: env.OPENROUTER_MODEL_FALLBACK1 ?? DEFAULT_CONFIG.models[1].model, maxRetries: 3 },
      { model: env.OPENROUTER_MODEL_FALLBACK2 ?? DEFAULT_CONFIG.models[2].model, maxRetries: 2 },
    ],
    temperature: parseFloat(env.LLM_TEMPERATURE ?? '0.1'),
    maxTokens: parseInt(env.LLM_MAX_TOKENS ?? '2000', 10),
  }
}

export async function callWithFallback(
  apiKey: string,
  messages: OpenRouterRequest['messages'],
  validateFn: (parsed: unknown) => boolean,
  config: LlmConfig = DEFAULT_CONFIG
): Promise<unknown> {
  const errors: string[] = []

  for (const { model, maxRetries } of config.models) {
    console.info(`[llm] trying model=${model}`)
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const content = await callOpenRouter(apiKey, {
          model,
          messages,
          response_format: { type: 'json_object' },
          temperature: config.temperature,
          max_tokens: config.maxTokens,
        })

        let parsed: unknown
        try {
          parsed = JSON.parse(content)
        } catch {
          // Bad JSON from this model — try next model
          errors.push(`${model}: returned invalid JSON`)
          break  // break inner → try next model in outer
        }

        if (validateFn(parsed)) {
          console.info(`[llm] success model=${model} attempt=${attempt}`)
          return parsed
        }

        // Valid JSON but failed schema — try next model
        console.warn(`[llm] model=${model} response failed schema validation, trying next model`)
        errors.push(`${model}: response failed schema validation`)
        break  // break inner → try next model in outer

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)

        if (message.includes('429')) {
          const waitMs = Math.pow(2, attempt) * 1000
          console.warn(`[llm] ${model} rate limited, waiting ${waitMs}ms`)
          await new Promise(resolve => setTimeout(resolve, waitMs))
          continue  // retry same model
        }

        // Any other error — log and skip to next model
        console.error(`[llm] model=${model} attempt=${attempt} error:`, message)
        errors.push(`${model}: ${message}`)
        break  // break inner → try next model in outer
      }
    }
  }

  console.error('[llm] All models exhausted:', errors.join(' | '))
  throw new AppError('All AI models exhausted without a valid response', 503)
}

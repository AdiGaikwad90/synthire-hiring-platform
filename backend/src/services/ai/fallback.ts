import { AppError } from '../../types/api'
import { callOpenRouter } from './openrouter'
import type { OpenRouterRequest } from './openrouter'

const MODEL_CHAIN = [
  { model: 'qwen/qwen3-235b-a22b:free', maxRetries: 3 },
  { model: 'google/gemma-3-27b-it:free', maxRetries: 3 },
  { model: 'openai/gpt-4o-mini', maxRetries: 2 },
]

export async function callWithFallback(
  apiKey: string,
  messages: OpenRouterRequest['messages'],
  validateFn: (parsed: unknown) => boolean
): Promise<unknown> {
  for (const { model, maxRetries } of MODEL_CHAIN) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const content = await callOpenRouter(apiKey, {
          model,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.1,
        })

        let parsed: unknown
        try {
          parsed = JSON.parse(content)
        } catch {
          // Invalid JSON — try next attempt/model
          break
        }

        if (validateFn(parsed)) {
          return parsed
        }

        // Validation failed — try next model
        break
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)

        // 429 rate limit — exponential backoff, retry same model
        if (message.includes('429')) {
          const waitMs = Math.pow(2, attempt) * 1000
          await new Promise(resolve => setTimeout(resolve, waitMs))
          continue
        }

        // Other error — move to next model
        break
      }
    }
  }

  throw new AppError('All AI models exhausted without a valid response', 503)
}

import type { Ai } from '@cloudflare/workers-types'

/**
 * NOTE: do not add Workers AI JSON Mode (`response_format: json_schema`) here.
 * The docs list "Llama 3.1 8B variants" as supported, but the models this
 * project uses reject it:
 *   @cf/meta/llama-3.1-8b-instruct-fp8      -> error 5025 "doesn't support JSON Schema"
 *   @cf/meta/llama-3.3-70b-instruct-fp8-fast -> upstream internal error
 * Valid JSON is achieved instead with an adequate token budget (see
 * MAX_TOKENS_BY_OPERATION) plus extractJson() and Zod validation.
 */
export interface WorkersAIRequest {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  temperature?: number
  max_tokens?: number
}

export interface WorkersAIResult {
  content: string
  /** 'length' means the model hit max_tokens and the JSON is truncated. */
  finishReason?: string
}

export async function callWorkersAI(
  ai: Ai,
  model: string,
  request: WorkersAIRequest,
): Promise<WorkersAIResult> {
  const payload: Record<string, unknown> = {
    messages: request.messages,
    temperature: request.temperature ?? 0.1,
    max_tokens: request.max_tokens ?? 2000,
  }

  const result = (await (ai as any).run(model, payload)) as {
    response?: string | Record<string, unknown>
    finish_reason?: string
  }

  // In JSON Mode some models return an already-parsed object rather than a
  // string. Normalise so callers always get text to JSON.parse.
  const raw = result?.response
  const content = typeof raw === 'string' ? raw : raw ? JSON.stringify(raw) : ''

  if (!content) throw new Error(`Workers AI model ${model} returned empty response`)
  return { content, finishReason: result?.finish_reason }
}

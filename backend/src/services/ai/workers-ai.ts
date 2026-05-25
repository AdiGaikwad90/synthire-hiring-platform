import type { Ai } from '@cloudflare/workers-types'

export interface WorkersAIRequest {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  temperature?: number
  max_tokens?: number
}

export async function callWorkersAI(ai: Ai, model: string, request: WorkersAIRequest): Promise<string> {
  const result = await (ai as any).run(model, {
    messages: request.messages,
    temperature: request.temperature ?? 0.1,
    max_tokens: request.max_tokens ?? 2000,
  }) as { response?: string }

  const content = result?.response
  if (!content) throw new Error(`Workers AI model ${model} returned empty response`)
  return content
}

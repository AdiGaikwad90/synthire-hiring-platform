export interface OpenRouterRequest {
  model: string
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  response_format?: { type: 'json_object' }
  temperature?: number
  max_tokens?: number
}

export interface OpenRouterResponse {
  choices: { message: { content: string } }[]
  usage?: { prompt_tokens: number; completion_tokens: number }
  error?: { message: string; code: number }
}

export async function callOpenRouter(
  apiKey: string,
  request: OpenRouterRequest
): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://synthire.io',
      'X-Title': 'Synthire',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenRouter HTTP error ${response.status}: ${text}`)
  }

  const data = await response.json() as OpenRouterResponse

  if (data.error) {
    throw new Error(`OpenRouter API error ${data.error.code}: ${data.error.message}`)
  }

  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('OpenRouter returned empty response')
  }

  return content
}

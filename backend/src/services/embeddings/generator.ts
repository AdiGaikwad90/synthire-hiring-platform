import type { Ai } from '@cloudflare/workers-types'

const MAX_TEXT_LENGTH = 8000

export async function generateEmbedding(ai: Ai, text: string): Promise<number[]> {
  const truncated = text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text

  const result = await ai.run('@cf/baai/bge-large-en-v1.5', { text: truncated }) as {
    data: number[][]
    shape: number[]
  }

  return result.data[0]
}

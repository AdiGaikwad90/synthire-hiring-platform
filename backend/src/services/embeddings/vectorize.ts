import type { VectorizeIndex } from '@cloudflare/workers-types'

export async function upsertEmbedding(
  vectorize: VectorizeIndex,
  id: string,
  embedding: number[],
  metadata: { candidateId: string; jobId: string; companyId: string }
): Promise<void> {
  await vectorize.upsert([
    {
      id,
      values: embedding,
      metadata,
    },
  ])
}

export async function queryEmbedding(
  vectorize: VectorizeIndex,
  embedding: number[],
  topK: number
): Promise<{ id: string; score: number }[]> {
  const result = await vectorize.query(embedding, { topK })

  return (result.matches ?? []).map(match => ({
    id: match.id,
    score: match.score,
  }))
}

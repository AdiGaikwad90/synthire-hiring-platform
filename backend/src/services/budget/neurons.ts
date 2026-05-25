import type { KVNamespace } from '@cloudflare/workers-types'
import { AppError } from '../../types/api'

export type NeuronOperation = 'LLM_PARSE' | 'LLM_SCORE' | 'LLM_QUESTIONS' | 'EMBEDDING'

export const NEURON_COSTS: Record<NeuronOperation, number> = {
  LLM_PARSE: 100,
  LLM_SCORE: 150,
  LLM_QUESTIONS: 80,
  EMBEDDING: 3,
}

function todayKey(): string {
  return `neurons:daily:${new Date().toISOString().slice(0, 10)}`
}

function secondsUntilMidnightUTC(): number {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setUTCHours(24, 0, 0, 0)
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000)
}

export async function checkNeuronBudget(
  kv: KVNamespace,
  operation: NeuronOperation,
  dailyLimit: number
): Promise<void> {
  const key = todayKey()
  const current = parseInt((await kv.get(key)) ?? '0', 10)
  const cost = NEURON_COSTS[operation]

  if (current + cost > dailyLimit) {
    const resetIn = secondsUntilMidnightUTC()
    const hours = Math.floor(resetIn / 3600)
    const minutes = Math.floor((resetIn % 3600) / 60)
    throw new AppError(
      `Daily AI usage limit reached (${current}/${dailyLimit} Neurons used). Resets in ${hours}h ${minutes}m at midnight UTC.`,
      503
    )
  }
}

export async function deductNeurons(
  kv: KVNamespace,
  operation: NeuronOperation
): Promise<number> {
  const key = todayKey()
  const current = parseInt((await kv.get(key)) ?? '0', 10)
  const cost = NEURON_COSTS[operation]
  const newTotal = current + cost
  const ttl = secondsUntilMidnightUTC()
  await kv.put(key, String(newTotal), { expirationTtl: ttl })
  console.info(`[neurons] ${operation} cost=${cost} total=${newTotal}`)
  return newTotal
}

export async function getNeuronStatus(kv: KVNamespace, dailyLimit: number): Promise<{
  used: number
  limit: number
  remaining: number
  date: string
  resetInSeconds: number
}> {
  const date = new Date().toISOString().slice(0, 10)
  const used = parseInt((await kv.get(`neurons:daily:${date}`)) ?? '0', 10)
  return {
    used,
    limit: dailyLimit,
    remaining: Math.max(0, dailyLimit - used),
    date,
    resetInSeconds: secondsUntilMidnightUTC(),
  }
}

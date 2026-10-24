import type { Ai, VectorizeIndex } from '@cloudflare/workers-types'

/**
 * Workers AI and Vectorize have no local simulator (TESTING.md §1), so queue
 * tests pass these in via { ...env, AI, VECTORIZE }. The AI stub tells a
 * scoring call from a parse call by the scoring prompt's opening line.
 */

export const STUB_PARSED_RESUME = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: null,
  location: 'Austin, TX',
  technical_skills: ['Go', 'PostgreSQL'],
  professional_experience: [],
  education_details: [],
  certifications: [],
  achievements: [],
}

export const STUB_SCORES = {
  dimensions: {
    skills: { technical: 80, soft: 70, domain: 60 },
    experience: { years_relevant: 60, industry_match: 55, leadership: 40 },
    education: { degree_level: 70, field_relevance: 65, certifications: 20 },
    achievements: { impact: 60, recognition: 30 },
  },
  summary: 'Solid backend engineer',
  strengths: ['Go in production'],
  concerns: [],
  skill_matches: [{ skill: 'Go', verdict: 'evidenced', evidence: 'Go services at Acme', via: null }],
}

export function stubAi(opts: { parse?: unknown; score?: unknown; failOn?: 'parse' | 'score' } = {}) {
  const calls = { parse: 0, score: 0, embed: 0 }
  const ai = {
    run: async (model: string, input: { messages?: { content: string }[] }) => {
      if (model.includes('bge')) {
        calls.embed++
        return { data: [Array.from({ length: 1024 }, () => 0.5)] }
      }
      const prompt = (input.messages ?? []).map((m) => m.content).join('\n')
      if (prompt.includes('Score this candidate')) {
        calls.score++
        if (opts.failOn === 'score') throw new Error('Workers AI 502 (stub)')
        return { response: JSON.stringify(opts.score ?? STUB_SCORES) }
      }
      calls.parse++
      if (opts.failOn === 'parse') throw new Error('Workers AI 502 (stub)')
      return { response: JSON.stringify(opts.parse ?? STUB_PARSED_RESUME) }
    },
  } as unknown as Ai
  return { ai, calls }
}

export function stubVectorize() {
  const upserted: string[] = []
  const deleted: string[][] = []
  const index = {
    upsert: async (vectors: { id: string }[]) => { upserted.push(...vectors.map((v) => v.id)); return {} },
    deleteByIds: async (ids: string[]) => { deleted.push(ids); return {} },
  } as unknown as VectorizeIndex
  return { index, upserted, deleted }
}

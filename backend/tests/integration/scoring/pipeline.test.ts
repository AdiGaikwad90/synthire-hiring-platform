import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { runScoringPipeline, type ScoringInput } from '../../../src/services/scoring/pipeline'
import { DEFAULT_SCORING_DIMENSIONS } from '../../../src/services/scoring/dimensions'
import type { Env } from '../../../src/types/bindings'
import type { ParsedResume } from '../../../src/services/ai/prompts/parse-resume'

/**
 * Real KV (the Neuron budget lives there), stubbed AI and Vectorize — neither
 * has a local simulator (TESTING.md §1). The stub records every prompt so the
 * test can assert what the model was and was not told.
 */

const SCORES = {
  dimensions: {
    skills: { technical: 80, soft: 70, domain: 60 },
    experience: { years_relevant: 60, industry_match: 55, leadership: 40 },
    education: { degree_level: 70, field_relevance: 65, certifications: 20 },
    achievements: { impact: 60, recognition: 30 },
  },
  summary: 'Solid platform engineer',
  strengths: ['Kubernetes in production'],
  concerns: [],
}

let prompts: string[]
function stubEnv(llmPayload: unknown): Env {
  prompts = []
  const AI = {
    run: async (model: string, input: { messages?: { content: string }[] }) => {
      if (model.includes('bge')) return { data: [Array.from({ length: 1024 }, () => 0.5)] }
      prompts.push((input.messages ?? []).map((m) => m.content).join('\n'))
      return { response: JSON.stringify(llmPayload) }
    },
  }
  const VECTORIZE = { upsert: async () => ({}) }
  return { ...env, AI, VECTORIZE } as unknown as Env
}

const input = (over: Partial<ScoringInput> = {}): ScoringInput => ({
  candidateId: 'cand_x', jobId: 'job_x', companyId: 'co_x',
  resumeText: 'Five years running Kubernetes on EKS; TypeScript services.',
  jobTitle: 'Platform Engineer', jobDescription: 'Run our infra',
  requiredSkills: ['Kubernetes'], niceToHaveSkills: ['Rust'],
  minYearsExperience: 3, scoringWeights: DEFAULT_SCORING_DIMENSIONS,
  parsedResume: {} as ParsedResume,
  ...over,
})

beforeEach(() => { prompts = [] })

describe('runScoringPipeline — skill matches and attribution', () => {
  it('returns normalised verdicts and an attribution that sums to the overall', async () => {
    const r = await runScoringPipeline(stubEnv({
      ...SCORES,
      skill_matches: [{ skill: 'kubernetes', verdict: 'Evidenced', evidence: 'EKS for 5 years', via: null }],
    }), input())

    expect(r.skill_matches).toEqual([
      { skill: 'Kubernetes', requirement: 'required', verdict: 'evidenced', evidence: 'EKS for 5 years', via: null },
    ])
    const a = JSON.parse(r.score_attribution)
    const sum = Object.values(a.contributions as Record<string, number>).reduce((s, n) => s + n, 0)
    expect(Math.abs(sum - r.overall_score)).toBeLessThanOrEqual(0.55)
  })

  it('asks for verdicts and never tells the model the weights', async () => {
    await runScoringPipeline(stubEnv(SCORES), input())
    expect(prompts[0]).toContain('- Kubernetes [required]')
    expect(prompts[0].toLowerCase()).not.toContain('importance')
  })

  it('still scores when skill_matches is malformed — the upload must not fail', async () => {
    const r = await runScoringPipeline(stubEnv({ ...SCORES, skill_matches: 'Kubernetes: yes' }), input())
    expect(r.skill_matches).toEqual([])
    expect(r.overall_score).toBeGreaterThan(0)
  })

  it('produces no verdicts for a job with no skills', async () => {
    const r = await runScoringPipeline(
      stubEnv({ ...SCORES, skill_matches: [{ skill: 'Kubernetes', verdict: 'evidenced' }] }),
      input({ requiredSkills: [], niceToHaveSkills: [] }),
    )
    expect(r.skill_matches).toEqual([])
    expect(prompts[0]).not.toContain('skill_matches')
  })

  it('clamps a negative cosine similarity to 0 rather than a negative semantic score', async () => {
    prompts = []
    let embedCalls = 0
    const AI = {
      run: async (model: string, input: { messages?: { content: string }[] }) => {
        // Opposite unit vectors → cosine similarity -1, which would otherwise
        // round to a negative semantic score and a negative contribution/bar.
        if (model.includes('bge')) {
          const sign = embedCalls++ === 0 ? 1 : -1
          return { data: [Array.from({ length: 1024 }, () => sign * 0.5)] }
        }
        prompts.push((input.messages ?? []).map((m) => m.content).join('\n'))
        return { response: JSON.stringify(SCORES) }
      },
    }
    const VECTORIZE = { upsert: async () => ({}) }
    const r = await runScoringPipeline({ ...env, AI, VECTORIZE } as unknown as Env, input())
    expect(r.semantic_score).toBe(0)
  })
})

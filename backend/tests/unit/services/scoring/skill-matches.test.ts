import { describe, it, expect } from 'vitest'
import {
  selectSkillsForAdjudication,
  normalizeSkillMatches,
  MAX_ADJUDICATED_SKILLS,
  MAX_EVIDENCE_CHARS,
  type SkillToAdjudicate,
} from '../../../../src/services/scoring/skill-matches'

/**
 * The model's skill_matches output is untrusted: it can rename skills, invent
 * extra ones, misspell verdicts or omit the field. normalizeSkillMatches is the
 * one place that turns it into rows we are willing to show a recruiter, and it
 * must fail closed — never credit a skill on ambiguity.
 */

const REQ: SkillToAdjudicate[] = [
  { skill: 'Kubernetes', requirement: 'required' },
  { skill: 'TypeScript', requirement: 'required' },
  { skill: 'Rust', requirement: 'nice_to_have' },
]

describe('selectSkillsForAdjudication — happy path', () => {
  it('returns required skills first, then nice-to-have, in job order', () => {
    expect(selectSkillsForAdjudication(['Go', 'SQL'], ['Rust'])).toEqual([
      { skill: 'Go', requirement: 'required' },
      { skill: 'SQL', requirement: 'required' },
      { skill: 'Rust', requirement: 'nice_to_have' },
    ])
  })
})

describe('selectSkillsForAdjudication — positive variants', () => {
  it('handles a job with only nice-to-have skills', () => {
    expect(selectSkillsForAdjudication([], ['Rust'])).toEqual([{ skill: 'Rust', requirement: 'nice_to_have' }])
  })

  it('keeps a skill listed as both required and nice-to-have once, as required', () => {
    expect(selectSkillsForAdjudication(['Go'], ['go', 'Rust'])).toEqual([
      { skill: 'Go', requirement: 'required' },
      { skill: 'Rust', requirement: 'nice_to_have' },
    ])
  })
})

describe('selectSkillsForAdjudication — boundaries', () => {
  const many = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i}`)

  it(`caps at ${MAX_ADJUDICATED_SKILLS}, dropping nice-to-have before required`, () => {
    const out = selectSkillsForAdjudication(many(20, 'r'), many(20, 'n'))
    expect(out).toHaveLength(MAX_ADJUDICATED_SKILLS)
    expect(out.filter((s) => s.requirement === 'required')).toHaveLength(20)
    expect(out.at(-1)).toEqual({ skill: 'n4', requirement: 'nice_to_have' })
  })

  it('truncates required skills too when they alone exceed the cap', () => {
    const out = selectSkillsForAdjudication(many(30, 'r'), ['Rust'])
    expect(out).toHaveLength(MAX_ADJUDICATED_SKILLS)
    expect(out.every((s) => s.requirement === 'required')).toBe(true)
  })

  it('returns exactly the cap when the job has exactly the cap', () => {
    expect(selectSkillsForAdjudication(many(25, 'r'), [])).toHaveLength(25)
  })

  it('returns nothing for a cap of 0', () => {
    expect(selectSkillsForAdjudication(['Go'], [], 0)).toEqual([])
  })
})

describe('selectSkillsForAdjudication — invalid input', () => {
  it('trims, and skips blanks, duplicates and non-strings from a hand-edited JSON column', () => {
    expect(selectSkillsForAdjudication(['  Go ', '', '   ', 'GO', 42, null, { x: 1 }], [])).toEqual([
      { skill: 'Go', requirement: 'required' },
    ])
  })

  it('treats a non-array required/niceToHave (malformed JSON column) as empty rather than throwing', () => {
    expect(selectSkillsForAdjudication('Go' as unknown as unknown[], { x: 1 } as unknown as unknown[])).toEqual([])
  })
})

describe('selectSkillsForAdjudication — empty', () => {
  it('returns [] for a job with no skills', () => {
    expect(selectSkillsForAdjudication([], [])).toEqual([])
  })
})

// Error contract: N/A — pure function, never throws.

describe('normalizeSkillMatches — happy path', () => {
  it('maps model output onto the requested skills, in requested order, with the job\'s requirement', () => {
    const out = normalizeSkillMatches(
      [
        { skill: 'Rust', verdict: 'claimed', evidence: 'Listed under skills', via: null },
        { skill: 'Kubernetes', verdict: 'evidenced', evidence: 'Ran EKS clusters at Acme', via: null },
        { skill: 'TypeScript', verdict: 'transferable', evidence: 'Heavy JavaScript work', via: 'JavaScript' },
      ],
      REQ,
    )
    expect(out).toEqual([
      { skill: 'Kubernetes', requirement: 'required', verdict: 'evidenced', evidence: 'Ran EKS clusters at Acme', via: null },
      { skill: 'TypeScript', requirement: 'required', verdict: 'transferable', evidence: 'Heavy JavaScript work', via: 'JavaScript' },
      { skill: 'Rust', requirement: 'nice_to_have', verdict: 'claimed', evidence: 'Listed under skills', via: null },
    ])
  })
})

describe('normalizeSkillMatches — positive variants', () => {
  it('matches skill names case- and whitespace-insensitively and keeps the job\'s spelling', () => {
    const out = normalizeSkillMatches([{ skill: '  kubernetes ', verdict: 'evidenced' }], REQ)
    expect(out[0]).toMatchObject({ skill: 'Kubernetes', verdict: 'evidenced' })
  })

  it('accepts a verdict with different casing or padding — that is not ambiguity', () => {
    const out = normalizeSkillMatches([{ skill: 'Kubernetes', verdict: ' Evidenced ' }], REQ)
    expect(out[0].verdict).toBe('evidenced')
  })

  it('ignores the model\'s requirement field — the job owns that', () => {
    const out = normalizeSkillMatches([{ skill: 'Rust', requirement: 'required', verdict: 'missing' }], REQ)
    expect(out.find((m) => m.skill === 'Rust')?.requirement).toBe('nice_to_have')
  })
})

describe('normalizeSkillMatches — boundaries', () => {
  it(`truncates evidence to ${MAX_EVIDENCE_CHARS} characters`, () => {
    const out = normalizeSkillMatches([{ skill: 'Kubernetes', verdict: 'evidenced', evidence: 'x'.repeat(1000) }], REQ)
    expect(out[0].evidence).toHaveLength(MAX_EVIDENCE_CHARS)
  })

  it('keeps the first verdict when the model repeats a skill', () => {
    const out = normalizeSkillMatches(
      [{ skill: 'Kubernetes', verdict: 'missing' }, { skill: 'kubernetes', verdict: 'evidenced' }],
      REQ,
    )
    expect(out[0].verdict).toBe('missing')
    expect(out).toHaveLength(1)
  })
})

describe('normalizeSkillMatches — invalid input', () => {
  it('fails closed: an unknown verdict becomes missing', () => {
    for (const verdict of ['great', 'partial', 'yes', '', 7, null, undefined]) {
      const out = normalizeSkillMatches([{ skill: 'Kubernetes', verdict }], REQ)
      expect(out[0].verdict, `"${String(verdict)}" must not be credited`).toBe('missing')
    }
  })

  it('omits requested skills the model did not return a verdict for', () => {
    const out = normalizeSkillMatches([{ skill: 'Kubernetes', verdict: 'evidenced' }], REQ)
    expect(out.find((m) => m.skill === 'Rust')).toBeUndefined()
    expect(out.find((m) => m.skill === 'TypeScript')).toBeUndefined()
    expect(out).toHaveLength(1)
  })

  it('drops skills the model invented', () => {
    const out = normalizeSkillMatches([{ skill: 'Kubernetes', verdict: 'evidenced' }, { skill: 'COBOL', verdict: 'evidenced' }], REQ)
    expect(out.map((m) => m.skill)).toEqual(['Kubernetes'])
  })

  it('discards via on any verdict other than transferable', () => {
    const out = normalizeSkillMatches([{ skill: 'Kubernetes', verdict: 'evidenced', via: 'Docker' }], REQ)
    expect(out[0].via).toBeNull()
  })

  it('turns non-string or blank evidence into null', () => {
    for (const evidence of [42, {}, '   ', null]) {
      const out = normalizeSkillMatches([{ skill: 'Kubernetes', verdict: 'evidenced', evidence }], REQ)
      expect(out[0].evidence, JSON.stringify(evidence)).toBeNull()
    }
  })

  it('skips malformed entries without discarding the valid ones', () => {
    const out = normalizeSkillMatches([null, 'Kubernetes', 42, { verdict: 'evidenced' }, { skill: 'TypeScript', verdict: 'evidenced' }], REQ)
    expect(out.find((m) => m.skill === 'TypeScript')?.verdict).toBe('evidenced')
  })
})

describe('normalizeSkillMatches — empty', () => {
  // Returning [] (not "everything missing") is deliberate: the UI shows
  // "not available" instead of accusing the candidate of lacking every skill
  // because the model skipped the field.
  it.each([
    ['field absent', undefined],
    ['not an array', 'Kubernetes: yes'],
    ['an object', { Kubernetes: 'evidenced' }],
    ['empty array', []],
    ['no entry matches a requested skill', [{ skill: 'COBOL', verdict: 'evidenced' }]],
  ])('returns [] when %s', (_n, raw) => {
    expect(normalizeSkillMatches(raw, REQ)).toEqual([])
  })

  it('returns [] when nothing was requested', () => {
    expect(normalizeSkillMatches([{ skill: 'Kubernetes', verdict: 'evidenced' }], [])).toEqual([])
  })
})

// Error contract: N/A — pure function, never throws.

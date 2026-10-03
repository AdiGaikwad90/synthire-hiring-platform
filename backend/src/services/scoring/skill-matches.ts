/**
 * Per-skill verdicts from the scoring call.
 *
 * The model judges each job skill the way a senior recruiter would — from the
 * work described, not keyword presence — and this module turns that untrusted
 * output into rows. It fails closed: anything ambiguous becomes `missing`.
 */

export const VERDICTS = ['evidenced', 'claimed', 'transferable', 'missing'] as const
export type Verdict = (typeof VERDICTS)[number]
export type Requirement = 'required' | 'nice_to_have'

/** Bounds prompt and response size. Required skills are kept first. */
export const MAX_ADJUDICATED_SKILLS = 25
export const MAX_EVIDENCE_CHARS = 280
const MAX_VIA_CHARS = 100

export interface SkillToAdjudicate {
  skill: string
  requirement: Requirement
}

export interface SkillMatch {
  skill: string
  requirement: Requirement
  verdict: Verdict
  evidence: string | null
  via: string | null
}

/**
 * Required first, then nice-to-have; trimmed, de-duplicated case-insensitively
 * (a skill in both lists counts as required), capped. Inputs are typed unknown
 * because they come from a D1 JSON column.
 */
export function selectSkillsForAdjudication(
  required: readonly unknown[],
  niceToHave: readonly unknown[],
  cap: number = MAX_ADJUDICATED_SKILLS,
): SkillToAdjudicate[] {
  const out: SkillToAdjudicate[] = []
  const seen = new Set<string>()
  const add = (list: readonly unknown[], requirement: Requirement) => {
    for (const raw of list) {
      if (out.length >= cap) return
      if (typeof raw !== 'string') continue
      const skill = raw.trim()
      const key = skill.toLowerCase()
      if (!skill || seen.has(key)) continue
      seen.add(key)
      out.push({ skill, requirement })
    }
  }
  add(Array.isArray(required) ? required : [], 'required')
  add(Array.isArray(niceToHave) ? niceToHave : [], 'nice_to_have')
  return out
}

/**
 * Only the skills the model actually returned a verdict for, still in
 * requested order. Returns [] when the model gave nothing usable, so the UI
 * can say "not available" rather than marking every skill missing because the
 * field was skipped. Skills the model omitted are simply absent — the
 * frontend's evaluationCoverage() already lists those as "Not evaluated",
 * so padding them here would double-count the omission as a verdict.
 */
export function normalizeSkillMatches(raw: unknown, requested: readonly SkillToAdjudicate[]): SkillMatch[] {
  if (!Array.isArray(raw) || requested.length === 0) return []

  const wanted = new Map(requested.map((r) => [r.skill.toLowerCase(), r]))
  const found = new Map<string, SkillMatch>()

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (typeof o.skill !== 'string') continue
    const key = o.skill.trim().toLowerCase()
    const req = wanted.get(key)
    if (!req || found.has(key)) continue

    const v = typeof o.verdict === 'string' ? o.verdict.trim().toLowerCase() : ''
    const verdict: Verdict = (VERDICTS as readonly string[]).includes(v) ? (v as Verdict) : 'missing'
    found.set(key, {
      skill: req.skill,
      requirement: req.requirement,
      verdict,
      evidence: clip(o.evidence, MAX_EVIDENCE_CHARS),
      via: verdict === 'transferable' ? clip(o.via, MAX_VIA_CHARS) : null,
    })
  }

  if (found.size === 0) return []
  return requested.map((r) => found.get(r.skill.toLowerCase())).filter((m): m is SkillMatch => m !== undefined)
}

function clip(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s.slice(0, max) : null
}

import type { ApiScoreAttribution, ApiSkillMatch, DimensionKey, SkillVerdict } from './api'

/** Display order: strongest support first. */
export const VERDICT_ORDER: SkillVerdict[] = ['evidenced', 'transferable', 'claimed', 'missing']

// "claimed" reads as "listed, not evidenced" on purpose — the model's
// evidenced/claimed line is a judgement call, so it is presented as a prompt to
// look closer, not as a negative verdict.
export const VERDICT_META: Record<SkillVerdict, { label: string; variant: 'success' | 'info' | 'warning' | 'danger' }> = {
  evidenced: { label: 'Evidenced', variant: 'success' },
  transferable: { label: 'Transferable', variant: 'info' },
  claimed: { label: 'Listed, not evidenced', variant: 'warning' },
  missing: { label: 'Missing', variant: 'danger' },
}

const DIMENSIONS: DimensionKey[] = ['skills', 'experience', 'education', 'achievements']
const LABELS: Record<DimensionKey | 'semantic', string> = {
  skills: 'Skills',
  experience: 'Experience',
  education: 'Education & certifications',
  achievements: 'Achievements',
  semantic: 'Semantic match',
}

const norm = (s: unknown) => (typeof s === 'string' ? s.trim().toLowerCase() : '')

export function sortSkillMatches(matches: readonly ApiSkillMatch[]): ApiSkillMatch[] {
  const rank = (m: ApiSkillMatch) => VERDICT_ORDER.indexOf(m.verdict) * 2 + (m.requirement === 'required' ? 0 : 1)
  return [...matches].sort((a, b) => rank(a) - rank(b)) // Array#sort is stable
}

export function verdictCounts(matches: readonly ApiSkillMatch[]): Record<SkillVerdict, number> {
  const out: Record<SkillVerdict, number> = { evidenced: 0, transferable: 0, claimed: 0, missing: 0 }
  for (const m of matches) out[m.verdict] = (out[m.verdict] ?? 0) + 1
  return out
}

/** Job skills with no verdict — beyond the 25-skill cap, or added to the job after scoring. */
export function evaluationCoverage(
  matches: readonly ApiSkillMatch[],
  required: readonly string[],
  niceToHave: readonly string[],
): { total: number; notEvaluated: string[] } {
  const evaluated = new Set(matches.map((m) => norm(m.skill)))
  const seen = new Set<string>()
  const notEvaluated: string[] = []
  for (const raw of [...(required ?? []), ...(niceToHave ?? [])]) {
    const key = norm(raw)
    if (!key || seen.has(key)) continue
    seen.add(key)
    if (!evaluated.has(key)) notEvaluated.push(raw.trim())
  }
  return { total: seen.size, notEvaluated }
}

/**
 * Copy for the empty states on the Overview tab — skills panel and the
 * attribution fallback note. "Not available" is a false claim whenever
 * scoring hasn't actually run or has failed, so the reason comes from the
 * candidate's processing state, not a single hardcoded string.
 */
/** How often a candidate still being parsed/scored is refetched. */
export const CANDIDATE_POLL_MS = 3000

/**
 * react-query refetchInterval for a candidate: poll while the backend is still
 * working, stop at 'complete' or 'error'. Without it the detail page promised
 * results "when it finishes" and then never fetched them.
 */
export function candidatePollInterval(processingStatus: string | null | undefined): number | false {
  if (!processingStatus || processingStatus === 'complete' || processingStatus === 'error') return false
  return CANDIDATE_POLL_MS
}

export function skillsUnavailableReason(
  processingStatus: string | null | undefined,
  hasAttribution: boolean,
): { skills: string; attribution: string } {
  // 'error' is what updateCandidateError() writes on failure — there is no 'failed'.
  if (processingStatus !== 'complete' && processingStatus !== 'error') {
    return { skills: 'Scoring in progress — skill analysis will appear when it finishes.', attribution: 'Scoring in progress.' }
  }
  if (processingStatus === 'error') {
    return { skills: 'Scoring failed, so no skill analysis is available.', attribution: 'Scoring failed, so no weight breakdown is available.' }
  }
  if (hasAttribution) {
    return { skills: 'No skill verdicts were recorded for this scoring run.', attribution: 'Weight breakdown not available — this candidate was scored before it was recorded.' }
  }
  return { skills: 'Skill analysis not available — this candidate was scored before skill matching shipped.', attribution: 'Weight breakdown not available — this candidate was scored before it was recorded.' }
}

export function parseAttribution(raw: unknown): ApiScoreAttribution | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as ApiScoreAttribution
  if (a.version !== 1 || !a.contributions || !a.importances) return null
  const keys = [...DIMENSIONS, 'semantic'] as const
  if (!keys.every((k) => Number.isFinite(a.contributions[k]))) return null
  return a
}

export interface AttributionRow {
  id: DimensionKey | 'semantic'
  label: string
  /** Share of the overall score this part can contribute, 0-100. Rows sum to 100. */
  weightPct: number
  /** Points actually contributed to the overall. */
  points: number
  /** The 0-100 score the bar fills to (points ÷ weight). */
  score: number
  subDimensions: { key: string; label: string; score: number }[]
}

const humanize = (key: string) => key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')

export function attributionRows(a: ApiScoreAttribution): AttributionRow[] {
  const total = DIMENSIONS.reduce((s, d) => s + Math.max(0, a.importances[d] ?? 0), 0)
  const row = (id: DimensionKey | 'semantic', weightPct: number, subs: Record<string, number> = {}): AttributionRow => {
    const points = a.contributions[id]
    return {
      id,
      label: LABELS[id],
      weightPct,
      points,
      score: weightPct > 0 ? Math.round((points / weightPct) * 100) : 0,
      subDimensions: Object.entries(subs).map(([key, score]) => ({ key, label: humanize(key), score })),
    }
  }
  return [
    ...DIMENSIONS.map((d) => {
      const imp = Math.max(0, a.importances[d] ?? 0)
      return row(d, total > 0 ? (imp / total) * a.llmWeight * 100 : 0, a.subDimensions?.[d])
    }),
    row('semantic', a.semanticWeight * 100),
  ]
}

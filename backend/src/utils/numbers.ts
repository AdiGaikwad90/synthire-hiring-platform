// Coerces a loosely-typed "years of experience" value into a clean integer
// or null. LLM output is inconsistent: a number, a bare digit string, or
// free text like "5+ years" / "3-5 years". `Number(v) || null` turns all of
// those non-numeric strings into NaN -> null, silently losing the value.
export function coerceYears(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    const rounded = Math.round(value)
    return rounded < 0 ? null : rounded
  }
  if (typeof value === 'string') {
    const match = value.match(/-?\d+/)
    if (!match) return null
    const n = parseInt(match[0], 10)
    return n < 0 ? null : n
  }
  return null
}

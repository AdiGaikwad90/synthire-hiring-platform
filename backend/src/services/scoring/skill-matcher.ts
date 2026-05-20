export function skillMatchScore(
  candidateSkills: string[],
  requiredSkills: string[],
  niceToHaveSkills: string[]
): number {
  const normalize = (s: string) => s.toLowerCase().trim()
  const candidateNormalized = candidateSkills.map(normalize)

  const hasRequired = requiredSkills.length > 0
  const hasNiceToHave = niceToHaveSkills.length > 0

  if (!hasRequired && !hasNiceToHave) return 100

  let score = 0

  if (hasRequired) {
    const requiredNormalized = requiredSkills.map(normalize)
    const matchedRequired = requiredNormalized.filter(skill =>
      candidateNormalized.some(cs => cs.includes(skill) || skill.includes(cs))
    ).length
    score += (matchedRequired / requiredSkills.length) * 70
  }

  if (hasNiceToHave) {
    const niceNormalized = niceToHaveSkills.map(normalize)
    const matchedNice = niceNormalized.filter(skill =>
      candidateNormalized.some(cs => cs.includes(skill) || skill.includes(cs))
    ).length
    const niceWeight = hasRequired ? 30 : 100
    score += (matchedNice / niceToHaveSkills.length) * niceWeight
  } else if (hasRequired) {
    // No nice-to-have: required skills cover full 100 scale
    score = (score / 70) * 100
  }

  return Math.max(0, Math.min(100, score))
}

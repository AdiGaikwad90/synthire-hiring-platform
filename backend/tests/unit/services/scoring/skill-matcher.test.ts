import { describe, it, expect } from 'vitest'
import { skillMatchScore } from '../../../../src/services/scoring/skill-matcher'

describe('skillMatchScore — happy path', () => {
  it('scores a full match of required skills at 100 when there are no nice-to-haves', () => {
    expect(skillMatchScore(['React', 'TypeScript'], ['React', 'TypeScript'], [])).toBe(100)
  })

  it('scores no matches at 0', () => {
    expect(skillMatchScore(['COBOL'], ['React'], [])).toBe(0)
  })

  it('scores a half match of required skills at 50 with no nice-to-haves', () => {
    expect(skillMatchScore(['React'], ['React', 'Go'], [])).toBe(50)
  })

  it('splits 70/30 between required and nice-to-have when both are present', () => {
    // all required, no nice-to-have -> 70
    expect(skillMatchScore(['React'], ['React'], ['Go'])).toBe(70)
    // all of both -> 100
    expect(skillMatchScore(['React', 'Go'], ['React'], ['Go'])).toBe(100)
    // none required, all nice-to-have -> 30
    expect(skillMatchScore(['Go'], ['React'], ['Go'])).toBe(30)
  })

  it('lets nice-to-have carry the full 100 when no required skills are set', () => {
    expect(skillMatchScore(['Go'], [], ['Go'])).toBe(100)
    expect(skillMatchScore([], [], ['Go'])).toBe(0)
  })
})

describe('skillMatchScore — normalisation', () => {
  it('is case-insensitive', () => {
    expect(skillMatchScore(['react'], ['REACT'], [])).toBe(100)
  })

  it('ignores surrounding whitespace', () => {
    expect(skillMatchScore(['  React  '], ['React'], [])).toBe(100)
  })

  it('matches on substrings in both directions', () => {
    // Candidate lists a longer term than the requirement.
    expect(skillMatchScore(['ReactJS'], ['React'], [])).toBe(100)
    // Candidate lists a shorter term than the requirement.
    expect(skillMatchScore(['React'], ['ReactJS'], [])).toBe(100)
  })

  // Documents a real limitation rather than asserting it is desirable:
  // substring matching is generous and will produce false positives.
  it('substring matching can over-match unrelated skills', () => {
    expect(skillMatchScore(['Java'], ['JavaScript'], [])).toBe(100)
  })
})

describe('skillMatchScore — empty and boundary', () => {
  it('returns 100 when nothing is required at all', () => {
    expect(skillMatchScore([], [], [])).toBe(100)
    expect(skillMatchScore(['React'], [], [])).toBe(100)
  })

  it('returns 0 for a candidate with no skills when skills are required', () => {
    expect(skillMatchScore([], ['React'], [])).toBe(0)
    expect(skillMatchScore([], ['React'], ['Go'])).toBe(0)
  })

  it('never returns a value outside 0-100', () => {
    const cases: [string[], string[], string[]][] = [
      [[], [], []],
      [['a'], ['a'], ['a']],
      [['a', 'a', 'a'], ['a'], ['a']],
      [['x'], ['a', 'b', 'c'], ['d', 'e']],
    ]
    for (const [c, r, n] of cases) {
      const s = skillMatchScore(c, r, n)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(100)
      expect(Number.isNaN(s)).toBe(false)
    }
  })

  it('does not double-count a duplicated candidate skill', () => {
    expect(skillMatchScore(['React', 'React', 'React'], ['React', 'Go'], [])).toBe(50)
  })
})

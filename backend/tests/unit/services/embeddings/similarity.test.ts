import { describe, it, expect } from 'vitest'
import { cosineSimilarity } from '../../../../src/services/embeddings/similarity'

/** Drives 30% of every candidate's overall score by default. */
describe('cosineSimilarity — happy path', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10)
  })

  it('is scale-invariant — direction is what matters', () => {
    expect(cosineSimilarity([1, 2, 3], [10, 20, 30])).toBeCloseTo(1, 10)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0)
  })

  it('is symmetric', () => {
    const a = [0.2, 0.9, -0.4]
    const b = [0.7, 0.1, 0.5]
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10)
  })

  it('gives a sensible mid value for partially aligned vectors', () => {
    const s = cosineSimilarity([1, 1], [1, 0])
    expect(s).toBeGreaterThan(0.7)
    expect(s).toBeLessThan(0.71) // 1/sqrt(2)
  })
})

describe('cosineSimilarity — clamping', () => {
  // Note: the implementation clamps to [0, 1], so opposing vectors read as 0
  // rather than -1. Scores are consumed as 0-100, so a negative would be
  // meaningless downstream.
  it('clamps opposite vectors to 0 rather than returning -1', () => {
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBe(0)
  })

  it('never returns a value outside [0, 1]', () => {
    const cases: [number[], number[]][] = [
      [[1, 0], [-1, 0]],
      [[-5, -5], [5, 5]],
      [[1e6, 1e6], [1e-6, 1e-6]],
      [[0.5], [0.5]],
    ]
    for (const [a, b] of cases) {
      const s = cosineSimilarity(a, b)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
  })
})

describe('cosineSimilarity — degenerate input', () => {
  it('returns 0 for empty vectors instead of NaN', () => {
    expect(cosineSimilarity([], [])).toBe(0)
    expect(cosineSimilarity([1, 2], [])).toBe(0)
    expect(cosineSimilarity([], [1, 2])).toBe(0)
  })

  it('returns 0 for a zero vector instead of dividing by zero', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0)
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0)
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0)
  })

  it('never returns NaN for any of these', () => {
    const cases: [number[], number[]][] = [
      [[], []],
      [[0], [0]],
      [[0, 0, 0], [0, 0, 0]],
      [[1], [0]],
    ]
    for (const [a, b] of cases) {
      expect(Number.isNaN(cosineSimilarity(a, b)), `NaN for ${JSON.stringify([a, b])}`).toBe(false)
    }
  })

  it('handles realistic 1024-dim vectors (the bge-large-en-v1.5 size)', () => {
    const a = Array.from({ length: 1024 }, (_, i) => Math.sin(i))
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 10)
  })
})

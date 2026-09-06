import { describe, it, expect } from 'vitest'
import {
  normalizeScoringDimensions,
  DEFAULT_SCORING_DIMENSIONS,
  SUB_DIMENSION_KEYS,
  DIMENSION_IDS,
} from '../../../../src/services/scoring/dimensions'

/**
 * normalizeScoringDimensions is fed straight from a D1 TEXT column, so its
 * input is whatever was stored — including legacy v1 rows and malformed JSON.
 * It must always return a usable v2 shape.
 */

describe('defaults are internally consistent', () => {
  it('defines every dimension in DIMENSION_IDS', () => {
    for (const id of DIMENSION_IDS) {
      expect(DEFAULT_SCORING_DIMENSIONS[id]).toBeDefined()
    }
  })

  it('sub-dimension keys match SUB_DIMENSION_KEYS exactly', () => {
    for (const id of DIMENSION_IDS) {
      expect(Object.keys(DEFAULT_SCORING_DIMENSIONS[id].sub_dimensions).sort())
        .toEqual([...SUB_DIMENSION_KEYS[id]].sort())
    }
  })

  it('every default importance is within 0-100', () => {
    for (const id of DIMENSION_IDS) {
      const { importance } = DEFAULT_SCORING_DIMENSIONS[id]
      expect(importance).toBeGreaterThanOrEqual(0)
      expect(importance).toBeLessThanOrEqual(100)
    }
  })
})

describe('normalizeScoringDimensions — v2 input', () => {
  it('preserves a full v2 config', () => {
    const input = {
      skills: { importance: 10, sub_dimensions: { technical: 20, soft: 30, domain: 40 } },
    }
    const out = normalizeScoringDimensions(input)
    expect(out.skills.importance).toBe(10)
    expect(out.skills.sub_dimensions).toEqual({ technical: 20, soft: 30, domain: 40 })
  })

  it('fills unspecified dimensions from defaults', () => {
    const out = normalizeScoringDimensions({ skills: { importance: 10 } })
    expect(out.experience).toEqual(DEFAULT_SCORING_DIMENSIONS.experience)
  })

  it('fills unspecified sub-dimensions from defaults', () => {
    const out = normalizeScoringDimensions({
      skills: { importance: 10, sub_dimensions: { technical: 5 } },
    })
    expect(out.skills.sub_dimensions.technical).toBe(5)
    expect(out.skills.sub_dimensions.soft).toBe(DEFAULT_SCORING_DIMENSIONS.skills.sub_dimensions.soft)
  })

  it('ignores unknown sub-dimension keys', () => {
    const out = normalizeScoringDimensions({
      skills: { importance: 10, sub_dimensions: { technical: 5, bogus: 99 } },
    })
    expect(Object.keys(out.skills.sub_dimensions).sort()).toEqual([...SUB_DIMENSION_KEYS.skills].sort())
  })

  it('clamps out-of-range importance into 0-100', () => {
    const out = normalizeScoringDimensions({ skills: { importance: 5000 } })
    expect(out.skills.importance).toBe(100)
    const neg = normalizeScoringDimensions({ skills: { importance: -20 } })
    expect(neg.skills.importance).toBe(0)
  })
})

describe('normalizeScoringDimensions — legacy v1 input', () => {
  it('upgrades a flat sum-to-100 v1 object to v2', () => {
    const out = normalizeScoringDimensions({ skills: 40, experience: 30, education: 20, achievements: 10 })
    expect(out.skills.importance).toBe(40)
    expect(out.achievements.importance).toBe(10)
    // v1 had no sub-dimensions, so defaults must fill in.
    expect(out.skills.sub_dimensions).toEqual(DEFAULT_SCORING_DIMENSIONS.skills.sub_dimensions)
  })

  it('still returns a valid v2 shape from a partial v1 object', () => {
    const out = normalizeScoringDimensions({ skills: 40 })
    for (const id of DIMENSION_IDS) {
      expect(typeof out[id].importance).toBe('number')
      expect(Number.isNaN(out[id].importance)).toBe(false)
    }
  })
})

describe('normalizeScoringDimensions — malformed input', () => {
  it('falls back to defaults for null, undefined and primitives', () => {
    for (const bad of [null, undefined, 42, 'nope', true]) {
      expect(normalizeScoringDimensions(bad), `failed for ${JSON.stringify(bad)}`)
        .toEqual(DEFAULT_SCORING_DIMENSIONS)
    }
  })

  it('falls back to defaults for an empty object', () => {
    expect(normalizeScoringDimensions({})).toEqual(DEFAULT_SCORING_DIMENSIONS)
  })

  it('falls back to defaults for an object with no recognised keys', () => {
    expect(normalizeScoringDimensions({ foo: 1, bar: 2 })).toEqual(DEFAULT_SCORING_DIMENSIONS)
  })

  it('coerces non-numeric importance to 0 rather than NaN', () => {
    const out = normalizeScoringDimensions({ skills: { importance: 'lots' } })
    expect(out.skills.importance).toBe(0)
    expect(Number.isNaN(out.skills.importance)).toBe(false)
  })

  it('never throws, whatever it is handed', () => {
    const nasty: unknown[] = [
      [], [1, 2], { skills: null }, { skills: { importance: null } },
      { skills: { sub_dimensions: 'no' } }, { skills: { importance: NaN } },
      { skills: { importance: Infinity } },
    ]
    for (const n of nasty) {
      expect(() => normalizeScoringDimensions(n), `threw on ${JSON.stringify(n)}`).not.toThrow()
    }
  })

  it('always returns all four dimensions with finite importances', () => {
    const out = normalizeScoringDimensions({ skills: { importance: Infinity } })
    for (const id of DIMENSION_IDS) {
      expect(Number.isFinite(out[id].importance), `${id} not finite`).toBe(true)
    }
  })
})

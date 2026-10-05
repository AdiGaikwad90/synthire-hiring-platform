import { describe, it, expect } from 'vitest'
import { coerceYears } from '../../../src/utils/numbers'

describe('coerceYears — happy path', () => {
  it('passes a plain integer through', () => {
    expect(coerceYears(5)).toBe(5)
  })
})

describe('coerceYears — positive variants', () => {
  it('rounds a fractional number', () => {
    expect(coerceYears(5.6)).toBe(6)
  })
  it('extracts the leading integer from "5+ years"', () => {
    expect(coerceYears('5+ years')).toBe(5)
  })
  it('extracts the integer from "5 years"', () => {
    expect(coerceYears('5 years')).toBe(5)
  })
  it('takes the first integer from a range "3-5 years"', () => {
    expect(coerceYears('3-5 years')).toBe(3)
  })
  it('trims surrounding whitespace', () => {
    expect(coerceYears(' 7 ')).toBe(7)
  })
})

describe('coerceYears — boundaries', () => {
  it('keeps 0 as 0', () => {
    expect(coerceYears(0)).toBe(0)
  })
  it('turns a negative number into null', () => {
    expect(coerceYears(-3)).toBeNull()
  })
  it('turns a negative numeric string into null', () => {
    expect(coerceYears('-3')).toBeNull()
  })
})

describe('coerceYears — invalid input', () => {
  it('returns null for a string with no digit', () => {
    expect(coerceYears('several years')).toBeNull()
  })
  it('returns null for NaN', () => {
    expect(coerceYears(NaN)).toBeNull()
  })
  it('returns null for a boolean', () => {
    expect(coerceYears(true as unknown)).toBeNull()
  })
  it('returns null for an object', () => {
    expect(coerceYears({} as unknown)).toBeNull()
  })
})

describe('coerceYears — empty / zero', () => {
  it('returns null for null', () => {
    expect(coerceYears(null)).toBeNull()
  })
  it('returns null for undefined', () => {
    expect(coerceYears(undefined)).toBeNull()
  })
  it('returns null for an empty string', () => {
    expect(coerceYears('')).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import { extractJson } from '../../../../src/services/ai/fallback'

/**
 * extractJson parses UNTRUSTED model output. Small models routinely wrap JSON
 * in prose or markdown fences, and a miss here sends the request down the
 * fallback chain (costing Neurons) or fails the whole call.
 *
 * The contract is deliberately loose: return a string that JSON.parse has the
 * best chance with. It does not validate — callWithFallback does that.
 */

const parses = (s: string) => JSON.parse(extractJson(s))

describe('extractJson — happy path', () => {
  it('returns bare JSON untouched', () => {
    expect(parses('{"a":1}')).toEqual({ a: 1 })
  })

  it('handles a top-level array', () => {
    expect(parses('[1,2,3]')).toEqual([1, 2, 3])
  })
})

describe('extractJson — markdown fences', () => {
  it('strips a ```json fence', () => {
    expect(parses('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('strips a bare ``` fence', () => {
    expect(parses('```\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('ignores prose surrounding the fence', () => {
    expect(parses('Sure! Here you go:\n```json\n{"a":1}\n```\nHope that helps.')).toEqual({ a: 1 })
  })

  it('takes the fenced block in preference to loose braces elsewhere', () => {
    expect(parses('Not this {"wrong":true}\n```json\n{"right":true}\n```')).toEqual({ right: true })
  })
})

describe('extractJson — prose without fences', () => {
  it('finds an object buried in leading and trailing prose', () => {
    expect(parses('Here is the result: {"a":1} — let me know!')).toEqual({ a: 1 })
  })

  it('finds an array buried in prose', () => {
    expect(parses('Results: [1,2] done')).toEqual([1, 2])
  })

  it('spans nested objects to the LAST closing brace, not the first', () => {
    expect(parses('x {"a":{"b":{"c":1}}} y')).toEqual({ a: { b: { c: 1 } } })
  })

  it('keeps multi-line JSON intact', () => {
    expect(parses('Answer:\n{\n  "a": 1,\n  "b": [2, 3]\n}\nDone')).toEqual({ a: 1, b: [2, 3] })
  })
})

describe('extractJson — invalid and degenerate input', () => {
  // These must not throw. Returning something unparseable is fine — the caller
  // catches the JSON.parse failure and moves to the next model.
  it('returns the input unchanged when there is no JSON at all', () => {
    expect(extractJson('I cannot help with that.')).toBe('I cannot help with that.')
  })

  it('returns the input unchanged when a closing bracket is missing', () => {
    expect(extractJson('{"a":1')).toBe('{"a":1')
  })

  it('returns the input unchanged when the closing bracket precedes the opening one', () => {
    expect(extractJson('} then {')).toBe('} then {')
  })

  it('handles an empty string', () => {
    expect(extractJson('')).toBe('')
  })

  it('never throws on any of these', () => {
    for (const s of ['', '{', '}', '[', ']', '```', '```json', 'null', '{}', '[]', '{"a":']) {
      expect(() => extractJson(s), `threw on ${JSON.stringify(s)}`).not.toThrow()
    }
  })

  it('preserves an empty object and empty array', () => {
    expect(parses('{}')).toEqual({})
    expect(parses('[]')).toEqual([])
  })
})

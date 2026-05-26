import { describe, it, expect } from 'vitest'
import { escapeHtml, safeHref } from '../utils/html'

describe('escapeHtml', () => {
  it('escapes & < > " \' /', () => {
    const result = escapeHtml('<script>alert("xss")</script>')
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
    expect(result).not.toContain('"')
    expect(result).toContain('&lt;')
    expect(result).toContain('&gt;')
  })

  it('returns empty string for null', () => {
    expect(escapeHtml(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(escapeHtml(undefined)).toBe('')
  })

  it('converts numbers to string', () => {
    expect(escapeHtml(42)).toBe('42')
  })

  it('does not alter safe strings', () => {
    expect(escapeHtml('hello world')).toBe('hello world')
  })
})

describe('safeHref', () => {
  it('allows https URLs', () => {
    expect(safeHref('https://example.com/path')).toBe('https://example.com/path')
  })

  it('blocks http URLs', () => {
    expect(safeHref('http://example.com')).toBe('#')
  })

  it('blocks javascript: protocol', () => {
    expect(safeHref('javascript:alert(1)')).toBe('#')
  })

  it('returns # for null', () => {
    expect(safeHref(null)).toBe('#')
  })

  it('returns # for malformed URL', () => {
    expect(safeHref('not a url')).toBe('#')
  })
})

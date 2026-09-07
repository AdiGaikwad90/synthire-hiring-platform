import { describe, it, expect } from 'vitest'
import { cn, initials, formatDate, formatDateLong, formatTime, formatDateTime } from '@/lib/utils'

/**
 * These formatters are the fix for 11 inline `toLocaleDateString()` calls in 4
 * different formats, 5 of which were bare calls that rendered per the VIEWER's
 * browser locale. The point of the helpers is that output is identical for
 * every user, so that is what these tests pin.
 */

const ISO = '2026-09-08T14:30:00.000Z'

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('drops falsy values', () => {
    expect(cn('a', false && 'b', null, undefined, 'c')).toBe('a c')
  })

  it('lets a later tailwind class win over an earlier conflicting one', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('returns empty string for no input', () => {
    expect(cn()).toBe('')
  })
})

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Ada Lovelace')).toBe('AL')
  })

  it('caps at two letters for longer names', () => {
    expect(initials('Ada Byron King Lovelace')).toBe('AB')
  })

  it('handles a single name', () => {
    expect(initials('Ada')).toBe('A')
  })

  it('collapses extra whitespace instead of producing undefined', () => {
    expect(initials('  Ada   Lovelace  ')).toBe('AL')
  })

  it('returns empty string for empty-ish input rather than throwing', () => {
    for (const v of ['', '   ', null as unknown as string, undefined as unknown as string]) {
      expect(() => initials(v)).not.toThrow()
      expect(initials(v)).toBe('')
    }
  })

  it('uppercases', () => {
    expect(initials('ada lovelace')).toBe('AL')
  })
})

describe('formatDate', () => {
  it('renders the documented shape', () => {
    expect(formatDate(ISO)).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/)
  })

  it('accepts a Date and an ISO string identically', () => {
    expect(formatDate(new Date(ISO))).toBe(formatDate(ISO))
  })

  // The whole reason these helpers exist: a bare toLocaleDateString() follows
  // the viewer's locale, so two users saw different text for the same date.
  it('is locale-independent — pinned to en-US, not the runtime default', () => {
    expect(formatDate('2026-01-02T00:00:00.000Z')).toContain('Jan')
  })

  it('returns an em dash rather than "Invalid Date"', () => {
    for (const bad of ['', 'not-a-date', null, undefined]) {
      expect(formatDate(bad), `input ${JSON.stringify(bad)}`).toBe('—')
    }
  })
})

describe('formatDateLong', () => {
  it('includes the weekday and full month', () => {
    const out = formatDateLong(ISO)
    expect(out).toMatch(/day/)
    expect(out).toMatch(/September/)
  })

  it('degrades to an em dash on bad input', () => {
    expect(formatDateLong('garbage')).toBe('—')
  })
})

describe('formatTime', () => {
  it('renders hour and minute only', () => {
    expect(formatTime(ISO)).toMatch(/^\d{2}:\d{2}\s?(AM|PM)$/)
  })

  it('degrades to an em dash on bad input', () => {
    expect(formatTime(null)).toBe('—')
  })
})

describe('formatDateTime', () => {
  it('includes both the date and the time', () => {
    const out = formatDateTime(ISO)
    expect(out).toMatch(/Sep/)
    expect(out).toMatch(/\d{2}:\d{2}/)
  })

  it('degrades to an em dash on bad input', () => {
    expect(formatDateTime(undefined)).toBe('—')
  })
})

describe('every formatter, hostile input', () => {
  const fns = { formatDate, formatDateLong, formatTime, formatDateTime }
  const hostile = ['', '   ', 'null', 'undefined', 'NaN', '0000-00-00', '2026-13-45', null, undefined]

  for (const [name, fn] of Object.entries(fns)) {
    it(`${name} never throws and never leaks "Invalid Date"`, () => {
      for (const v of hostile) {
        expect(() => fn(v as string), `${name}(${JSON.stringify(v)})`).not.toThrow()
        expect(fn(v as string), `${name}(${JSON.stringify(v)})`).not.toContain('Invalid')
      }
    })
  }
})

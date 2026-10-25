import { describe, it, expect } from 'vitest'
import { isValidTimeZone, formatInterviewTime } from '../../../src/utils/dates'

/**
 * SYN-002. Emails used to format the interview time in the Worker's own zone
 * (UTC) because the zone the recruiter picked was never stored. Every email
 * template now formats through formatInterviewTime with the interview's zone.
 */

describe('isValidTimeZone — happy path and variants', () => {
  it('accepts IANA zone names, including half- and quarter-hour offsets', () => {
    for (const tz of ['UTC', 'America/Los_Angeles', 'Europe/London', 'Asia/Kolkata', 'Asia/Kathmandu']) {
      expect(isValidTimeZone(tz), tz).toBe(true)
    }
  })
})

describe('isValidTimeZone — invalid input', () => {
  it('rejects unknown names, non-strings and oversized input', () => {
    for (const tz of ['', 'Mars/Olympus', 'PST8PDT; DROP TABLE', 'not a zone', null, undefined, 42, {}, 'A'.repeat(65)]) {
      expect(isValidTimeZone(tz), `${JSON.stringify(tz)} must be rejected`).toBe(false)
    }
  })
})

describe('formatInterviewTime — happy path', () => {
  it('formats the instant in the interview\'s zone with the zone name', () => {
    // 21:00 UTC on 28 Oct 2026 = 2:00 PM Pacific Daylight Time.
    expect(formatInterviewTime('2026-10-28T21:00:00.000Z', 'America/Los_Angeles'))
      .toBe('Wednesday, October 28, 2026 at 2:00 PM PDT')
  })
})

describe('formatInterviewTime — positive variants', () => {
  it('switches to standard time after the DST change', () => {
    // 22:00 UTC on 4 Nov 2026 = 2:00 PM Pacific Standard Time.
    expect(formatInterviewTime('2026-11-04T22:00:00.000Z', 'America/Los_Angeles'))
      .toBe('Wednesday, November 4, 2026 at 2:00 PM PST')
  })

  it('handles a half-hour offset and a date that rolls over', () => {
    // 21:00 UTC = 02:30 the next day in India.
    expect(formatInterviewTime('2026-10-28T21:00:00.000Z', 'Asia/Kolkata'))
      .toBe('Thursday, October 29, 2026 at 2:30 AM GMT+5:30')
  })
})

describe('formatInterviewTime — empty and invalid input', () => {
  it('falls back to UTC, labelled, for interviews created before the zone was stored', () => {
    expect(formatInterviewTime('2026-10-28T21:00:00.000Z', null)).toBe('Wednesday, October 28, 2026 at 9:00 PM UTC')
    expect(formatInterviewTime('2026-10-28T21:00:00.000Z', undefined)).toBe('Wednesday, October 28, 2026 at 9:00 PM UTC')
  })

  it('falls back to UTC instead of throwing on a zone it cannot use', () => {
    expect(formatInterviewTime('2026-10-28T21:00:00.000Z', 'Mars/Olympus')).toBe('Wednesday, October 28, 2026 at 9:00 PM UTC')
  })

  it('returns an unparseable timestamp unchanged rather than "Invalid Date"', () => {
    expect(formatInterviewTime('not-a-date', 'UTC')).toBe('not-a-date')
  })
})

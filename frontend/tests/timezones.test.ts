import { describe, it, expect } from 'vitest'
import {
  zonedTimeToUtc,
  wallTimeIn,
  formatInZone,
  timeZoneOptions,
  isValidTimeZone,
  resolveTimeZone,
  preferredZone,
  sameZone,
} from '@/lib/timezones'

/**
 * SYN-002. The schedule form built the instant from the browser's clock and
 * ignored the zone picker, so "2 PM Pacific" from an IST browser was saved as
 * 2 PM IST. zonedTimeToUtc turns a wall time in a chosen zone into the instant.
 */

const wt = (year: number, month: number, day: number, hour: number, minute = 0) => ({ year, month, day, hour, minute })

describe('zonedTimeToUtc — happy path', () => {
  it('reads the wall time in the chosen zone, not the machine\'s', () => {
    // 2 PM Pacific Daylight Time on 28 Oct 2026 = 21:00 UTC.
    expect(zonedTimeToUtc(wt(2026, 10, 28, 14), 'America/Los_Angeles').toISOString()).toBe('2026-10-28T21:00:00.000Z')
  })
})

describe('zonedTimeToUtc — positive variants', () => {
  it.each([
    ['America/Los_Angeles', wt(2026, 11, 4, 14), '2026-11-04T22:00:00.000Z'],   // PST, after the change
    ['America/New_York', wt(2026, 6, 1, 9, 30), '2026-06-01T13:30:00.000Z'],
    ['Europe/London', wt(2026, 7, 1, 10), '2026-07-01T09:00:00.000Z'],         // BST
    ['Asia/Kolkata', wt(2026, 10, 28, 14), '2026-10-28T08:30:00.000Z'],        // +5:30
    ['Asia/Kathmandu', wt(2026, 10, 28, 14), '2026-10-28T08:15:00.000Z'],      // +5:45
    ['UTC', wt(2026, 10, 28, 14), '2026-10-28T14:00:00.000Z'],
  ])('%s', (tz, wall, iso) => {
    expect(zonedTimeToUtc(wall, tz).toISOString()).toBe(iso)
  })

  it('round-trips with wallTimeIn', () => {
    const instant = zonedTimeToUtc(wt(2026, 3, 15, 9, 45), 'Asia/Kolkata')
    expect(wallTimeIn(instant, 'Asia/Kolkata')).toEqual(wt(2026, 3, 15, 9, 45))
  })
})

describe('zonedTimeToUtc — boundaries (daylight-saving days)', () => {
  // Pinned behaviour, not a product choice users will often hit: the form only
  // offers 9 AM–6 PM, and these zones change clocks around 2 AM.
  it('moves a skipped local time forward by the gap (spring forward)', () => {
    // 2:30 AM on 8 Mar 2026 does not exist in Los Angeles; it becomes 3:30 AM PDT.
    const instant = zonedTimeToUtc(wt(2026, 3, 8, 2, 30), 'America/Los_Angeles')
    expect(instant.toISOString()).toBe('2026-03-08T10:30:00.000Z')
    expect(wallTimeIn(instant, 'America/Los_Angeles')).toEqual(wt(2026, 3, 8, 3, 30))
  })

  it('takes the first occurrence of a repeated local time (fall back)', () => {
    // 1:30 AM on 1 Nov 2026 happens twice in Los Angeles; the PDT one comes first.
    expect(zonedTimeToUtc(wt(2026, 11, 1, 1, 30), 'America/Los_Angeles').toISOString()).toBe('2026-11-01T08:30:00.000Z')
  })
})

describe('zonedTimeToUtc — invalid input', () => {
  it('throws on a zone that does not exist', () => {
    expect(() => zonedTimeToUtc(wt(2026, 10, 28, 14), 'Mars/Olympus')).toThrow(RangeError)
  })

  it('throws on a calendar date that does not exist instead of rolling it over', () => {
    expect(() => zonedTimeToUtc(wt(2026, 2, 30, 14), 'UTC')).toThrow(RangeError)
    expect(() => zonedTimeToUtc(wt(2026, 13, 1, 14), 'UTC')).toThrow(RangeError)
    expect(() => zonedTimeToUtc(wt(2026, 10, 28, 24), 'UTC')).toThrow(RangeError)
  })
})

describe('formatInZone', () => {
  // Must match formatInterviewTime() in backend/src/utils/dates.ts — the form's
  // email preview has to show exactly what the email will say.
  it('formats like the email does', () => {
    expect(formatInZone(new Date('2026-10-28T21:00:00.000Z'), 'America/Los_Angeles'))
      .toBe('Wednesday, October 28, 2026 at 2:00 PM PDT')
  })

  it('formats a half-hour zone with its offset name', () => {
    expect(formatInZone(new Date('2026-10-28T21:00:00.000Z'), 'Asia/Kolkata'))
      .toBe('Thursday, October 29, 2026 at 2:30 AM GMT+5:30')
  })
})

describe('isValidTimeZone / resolveTimeZone', () => {
  it('accepts real zones and rejects anything else', () => {
    expect(isValidTimeZone('Europe/Berlin')).toBe(true)
    for (const v of ['', 'Mars/Olympus', null, undefined, 7]) expect(isValidTimeZone(v), String(v)).toBe(false)
  })

  it('falls back to UTC when the browser reports nothing usable', () => {
    expect(resolveTimeZone('Asia/Kolkata')).toBe('Asia/Kolkata')
    expect(resolveTimeZone(undefined)).toBe('UTC')
    expect(resolveTimeZone('Mars/Olympus')).toBe('UTC')
  })
})

describe('timeZoneOptions', () => {
  const now = new Date('2026-07-01T12:00:00.000Z')

  it('labels the common zones with their current abbreviation', () => {
    const labels = Object.fromEntries(timeZoneOptions('UTC', now).map((o) => [o.value, o.label]))
    expect(labels['America/Los_Angeles']).toBe('Pacific (PDT)')
    expect(labels['Europe/London']).toBe('London (GMT+1)')
  })

  it('adds the viewer\'s zone first when it is not in the list', () => {
    const opts = timeZoneOptions('Europe/Berlin', now)
    expect(opts[0]).toEqual({ value: 'Europe/Berlin', label: 'Your time · Europe/Berlin (GMT+2)' })
    expect(opts.filter((o) => o.value === 'Europe/Berlin')).toHaveLength(1)
  })

  it('marks the viewer\'s zone instead of duplicating it when it is already listed', () => {
    const opts = timeZoneOptions('Asia/Kolkata', now)
    expect(opts.filter((o) => o.value === 'Asia/Kolkata')).toEqual([{ value: 'Asia/Kolkata', label: 'India (GMT+5:30) · your time' }])
  })

  // Found in the live pass: Chrome reports India as "Asia/Calcutta", the older
  // IANA alias. It must match the listed "Asia/Kolkata", not be added again.
  it('treats an alias of a listed zone as that zone', () => {
    const opts = timeZoneOptions('Asia/Calcutta', now)
    expect(opts).toHaveLength(6)
    expect(opts.find((o) => o.value === 'Asia/Kolkata')?.label).toBe('India (GMT+5:30) · your time')
    expect(opts.some((o) => o.value === 'Asia/Calcutta')).toBe(false)
  })
})

describe('preferredZone', () => {
  it('maps an alias to the listed spelling and leaves other zones alone', () => {
    expect(preferredZone('Asia/Calcutta')).toBe('Asia/Kolkata')
    expect(preferredZone('Asia/Kolkata')).toBe('Asia/Kolkata')
    expect(preferredZone('Europe/Berlin')).toBe('Europe/Berlin')
  })
})

describe('sameZone', () => {
  it('compares zones by identity, not spelling', () => {
    expect(sameZone('Asia/Calcutta', 'Asia/Kolkata')).toBe(true)
    expect(sameZone('Asia/Kolkata', 'Asia/Singapore')).toBe(false)
  })
})

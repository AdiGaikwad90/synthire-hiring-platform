/**
 * Wall-clock times in a chosen zone, using only the built-in Intl API.
 *
 * The schedule form used to build the instant with `new Date(y, m, d, h, mi)`,
 * which reads those numbers in the BROWSER's zone and ignored the picker —
 * "2 PM Pacific" from an IST browser was saved as 2 PM IST (SYN-002).
 */

export interface WallTime {
  year: number
  month: number // 1–12
  day: number
  hour: number // 0–23
  minute: number
}

const HALF_DAY_MS = 12 * 60 * 60 * 1000

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** The zone to default to: the given one if usable, else UTC. */
export function resolveTimeZone(tz: string | undefined): string {
  return isValidTimeZone(tz) ? tz : 'UTC'
}

/** The viewer's zone, e.g. "Asia/Kolkata"; UTC if the browser reports nothing usable. */
export function browserTimeZone(): string {
  try {
    return resolveTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return 'UTC'
  }
}

/** The wall time an instant shows in `timeZone`. */
export function wallTimeIn(instant: Date, timeZone: string): WallTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(instant)
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') }
}

const sameWallTime = (a: WallTime, b: WallTime) =>
  a.year === b.year && a.month === b.month && a.day === b.day && a.hour === b.hour && a.minute === b.minute

/** Offset of `timeZone` from UTC, in ms, at the given instant. */
function offsetAt(ms: number, timeZone: string): number {
  const w = wallTimeIn(new Date(ms), timeZone)
  const minuteFloor = ms - (((ms % 60_000) + 60_000) % 60_000)
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - minuteFloor
}

/**
 * The instant at which it is `wall` o'clock in `timeZone`.
 *
 * Daylight-saving days: a local time that is skipped (spring forward) moves
 * forward by the gap; one that happens twice (fall back) takes the first.
 */
export function zonedTimeToUtc(wall: WallTime, timeZone: string): Date {
  if (!isValidTimeZone(timeZone)) throw new RangeError(`Unknown time zone: ${timeZone}`)
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute)
  const check = new Date(asUtc)
  if (
    Number.isNaN(asUtc) || check.getUTCFullYear() !== wall.year || check.getUTCMonth() !== wall.month - 1 ||
    check.getUTCDate() !== wall.day || check.getUTCHours() !== wall.hour || check.getUTCMinutes() !== wall.minute
  ) {
    throw new RangeError(`Not a real date and time: ${JSON.stringify(wall)}`)
  }

  // The offsets in force half a day either side bracket any clock change.
  const before = offsetAt(asUtc - HALF_DAY_MS, timeZone)
  const after = offsetAt(asUtc + HALF_DAY_MS, timeZone)
  const matches = [...new Set([asUtc - before, asUtc - after])]
    .filter((ms) => sameWallTime(wallTimeIn(new Date(ms), timeZone), wall))
  if (matches.length) return new Date(Math.min(...matches))
  // Skipped local time: keep the pre-change offset, which lands after the gap.
  return new Date(asUtc - before)
}

/**
 * "Wednesday, October 28, 2026 at 2:00 PM PDT". Keep the options in step with
 * formatInterviewTime() in backend/src/utils/dates.ts so the form's email
 * preview matches the email that is sent.
 */
export function formatInZone(instant: Date, timeZone: string): string {
  return instant.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  })
}

/** Short zone name at a given instant: "PDT", "GMT+5:30", "UTC". */
function zoneAbbreviation(timeZone: string, at: Date): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
    .formatToParts(at).find((p) => p.type === 'timeZoneName')
  return part?.value ?? timeZone
}

const COMMON_ZONES: { value: string; name: string }[] = [
  { value: 'America/Los_Angeles', name: 'Pacific' },
  { value: 'America/New_York', name: 'Eastern' },
  { value: 'Europe/London', name: 'London' },
  { value: 'Asia/Kolkata', name: 'India' },
  { value: 'Asia/Singapore', name: 'Singapore' },
  { value: 'UTC', name: 'UTC' },
]

/** ICU's id for a zone. Aliases share one: Chrome reports India as "Asia/Calcutta". */
function canonicalZone(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone
  } catch {
    return tz
  }
}

/** True when two zone names are the same zone, e.g. "Asia/Calcutta" and "Asia/Kolkata". */
export function sameZone(a: string, b: string): boolean {
  return a === b || canonicalZone(a) === canonicalZone(b)
}

/** The picker's spelling of a zone when it is listed (Asia/Calcutta → Asia/Kolkata), else the zone itself. */
export function preferredZone(tz: string): string {
  return COMMON_ZONES.find((z) => sameZone(z.value, tz))?.value ?? tz
}

/** Zone picker options; the viewer's zone is marked, or added first when not listed. */
export function timeZoneOptions(viewerZone: string, now: Date = new Date()): { value: string; label: string }[] {
  const options = COMMON_ZONES.map(({ value, name }) => {
    const label = value === 'UTC' ? 'UTC' : `${name} (${zoneAbbreviation(value, now)})`
    return { value, label: sameZone(value, viewerZone) ? `${label} · your time` : label }
  })
  if (!COMMON_ZONES.some((z) => sameZone(z.value, viewerZone))) {
    options.unshift({ value: viewerZone, label: `Your time · ${viewerZone} (${zoneAbbreviation(viewerZone, now)})` })
  }
  return options
}

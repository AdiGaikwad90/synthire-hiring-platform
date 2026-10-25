/**
 * Interview times in emails. The Worker runs in UTC, so formatting without an
 * explicit zone showed every candidate a UTC time. Interviews now store the
 * IANA zone the recruiter picked (SYN-002) and every template formats with it.
 */

/** True for an IANA zone name the runtime can format in, e.g. "America/Los_Angeles". */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * "Wednesday, October 28, 2026 at 2:00 PM PDT". Interviews created before the
 * zone was stored (or with one the runtime can't use) render in UTC, labelled.
 * Keep the options in step with formatInZone() in frontend/lib/timezones.ts —
 * the scheduling form's email preview must match the email that is sent.
 */
export function formatInterviewTime(iso: string, timeZone?: string | null): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: isValidTimeZone(timeZone) ? timeZone : 'UTC',
    timeZoneName: 'short',
  })
}

/**
 * Escape characters that would break HTML context.
 * Must be applied to every user-controlled value interpolated into HTML.
 */
export function escapeHtml(raw: unknown): string {
  const str = raw == null ? '' : String(raw)
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

/**
 * Validate and return a safe https:// URL.
 * Returns '#' for anything that isn't a valid https URL.
 */
export function safeHref(raw: unknown): string {
  const str = raw == null ? '' : String(raw).trim()
  try {
    const url = new URL(str)
    if (url.protocol !== 'https:') return '#'
    return url.toString()
  } catch {
    return '#'
  }
}

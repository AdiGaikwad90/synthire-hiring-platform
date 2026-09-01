/**
 * Guardrail kill switches are fail-CLOSED.
 *
 * Only an explicit "false" (case-insensitive, trimmed) disables enforcement.
 * Anything else — unset, "", "True", "0", a typo — leaves the limit ON.
 *
 * The naive `(env.X ?? 'true') === 'true'` does the opposite: any value that
 * isn't exactly "true" silently uncaps the limit, so one typo in wrangler.toml
 * removes a billing guardrail with no error and no log line.
 */
export function isGuardrailEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() !== 'false'
}

/**
 * Test-only stand-in for `mammoth`.
 *
 * The real package pulls in bluebird, jszip and argparse, whose top-level
 * initialisation SEGFAULTS workerd when the vitest pool loads the worker.
 * Bisected: unpdf, jose and bcryptjs are all fine; mammoth alone is fatal.
 *
 * Aliased in vitest.config.mts for the integration project only — production
 * bundling is untouched. DOCX extraction is an external library boundary we do
 * not own, so per TESTING.md it is stubbed rather than exercised for real.
 */
export default {
  extractRawText: async (_input: { arrayBuffer: ArrayBuffer }) => ({
    value: 'stubbed docx text',
    messages: [] as unknown[],
  }),
}

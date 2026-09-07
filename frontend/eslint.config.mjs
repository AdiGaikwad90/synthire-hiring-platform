import { FlatCompat } from '@eslint/eslintrc'

/**
 * Flat config, migrated off `next lint` (deprecated, removed in Next 16).
 *
 * eslint-config-next 15 still ships legacy `.eslintrc`-shaped configs, so it is
 * bridged through FlatCompat rather than imported directly — importing
 * `eslint-config-next/core-web-vitals` from a flat config resolves to a CJS
 * file ESLint 9 cannot consume as an ES module.
 */
const compat = new FlatCompat({ baseDirectory: import.meta.dirname })

const config = [
  { ignores: ['.next/**', 'node_modules/**', '.vercel/**', '.wrangler/**', 'coverage/**'] },
  ...compat.extends('next/core-web-vitals'),
]

export default config

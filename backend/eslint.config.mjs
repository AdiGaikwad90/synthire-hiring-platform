import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['node_modules', '.wrangler', 'dist'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Worker code legitimately uses `any` for CF binding shims and D1 rows.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
)

export default [
  {
    files: ['src/**/*.js', 'src/**/*.ts'],
    ignores: ['dist/', 'node_modules/'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
    },
    rules: {
      semi: ['error', 'never'],
      quotes: ['error', 'single'],
      'comma-dangle': ['error', 'always-multiline'],
    },
  },
] 
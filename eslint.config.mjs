import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.spec-kit-venv/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  prettier,
];

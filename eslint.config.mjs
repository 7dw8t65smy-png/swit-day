// Flat ESLint config (v9) for the SWIT Day monorepo.
// Pragmatic, low-churn posture: genuine bugs are errors, stylistic/noisy
// rules are warnings or off. Non type-aware (no parserOptions.project) to
// keep linting fast across all three workspaces.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  // Build artifacts and config files are not linted.
  {
    ignores: [
      '**/dist/**',
      '**/out/**',
      '**/release/**',
      '**/node_modules/**',
      '**/*.config.{js,ts,mjs,cjs}'
    ]
  },

  // Base recommended rule sets.
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // All TypeScript / TSX sources.
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module'
    },
    rules: {
      // Low-churn posture: keep these non-blocking.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-constant-condition': ['warn', { checkLoops: false }],
      // Genuinely valuable — keep as errors.
      'no-fallthrough': 'error'
    }
  },

  // React renderer code runs in the browser.
  {
    files: ['packages/desktop/src/renderer/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    languageOptions: {
      globals: { ...globals.browser }
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
    }
  },

  // Electron main / preload run in Node.
  {
    files: ['packages/desktop/src/main/**/*.{ts,tsx}', 'packages/desktop/src/preload/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node }
    }
  },

  // Server and shared packages run in Node.
  {
    files: ['packages/server/**/*.ts', 'packages/shared/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node }
    }
  },

  // Disable formatting-related rules — Prettier owns formatting. Must be last.
  prettier
);

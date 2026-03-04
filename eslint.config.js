import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  // Base JS rules
  js.configs.recommended,

  // TypeScript rules
  ...tseslint.configs.recommended,

  // React hooks rules
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },

  // Global settings for all TS/TSX files
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // Allow unused vars prefixed with _ (common convention for intentionally ignored values)
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Allow 'any' with a warning instead of error (useful during rapid development)
      '@typescript-eslint/no-explicit-any': 'warn',
      // Prefer const
      'prefer-const': 'error',
      // No console in production code (warn to keep it discoverable)
      'no-console': 'warn',
    },
  },

  // Relax rules in test files and inject Vitest globals
  {
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        // Vitest globals (mirrors globals: true in vitest.config.ts)
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // Ignore generated/non-TS directories, plain JS config files, and JS test files
  {
    ignores: [
      'dist/**',
      'release/**',
      'node_modules/**',
      'server/**',
      'electron/**',
      'tests/server/**',   // Node.js test files; not TS and not linted here
      '*.js',
      '*.cjs',
    ],
  }
);

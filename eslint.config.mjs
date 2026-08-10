import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/.tools/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  },
  {
    // Plain Node scripts (dev tooling, seed scripts) - not processed by the TypeScript
    // parser, so they need Node's globals (console, process, ...) declared explicitly.
    // TS files don't need this: typescript-eslint's recommended config already disables
    // the base `no-undef` rule for them, since the compiler catches the same class of
    // error with full knowledge of @types/node's ambient declarations.
    files: ['**/*.mjs', '**/*.cjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
);

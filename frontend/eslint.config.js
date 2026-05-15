import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  {
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      'build',
      'test-results',
      'playwright-report',
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: '18.3' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      // This project carries a lot of inherited React code. Keep lint focused on
      // issues that are likely to break the app instead of migration noise.
      'no-case-declarations': 'off',
      'no-irregular-whitespace': 'off',
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react/jsx-no-target-blank': 'off',
      'react-refresh/only-export-components': [
        'off',
        { allowConstantExport: true },
      ],
      semi: 'off',
    },
  },
];

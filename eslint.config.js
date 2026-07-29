import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {...globals.browser, ...globals.node},
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    // Must track the installed React (19.x) — pinned at 18.3 the version-aware
    // rules were checking against the wrong React's semantics.
    settings: { react: { version: 'detect' } },
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
      'react/jsx-no-target-blank': 'off',
      'react/prop-types': 'off',
      // Underscore prefix marks intentionally unused bindings (e.g. Express
      // error-handler arity, omitting object keys via rest destructuring).
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Downgraded from the error it became in eslint-plugin-react-hooks 7.1.1
      // (July 2026 dependency upgrade). It flags seven long-standing spots
      // where an effect sets state synchronously — URL-param mirroring in
      // App.jsx, the imperative YouTube player teardown, tenant loading. They
      // are cascading-render smells worth unpicking, but each needs a real
      // state-flow change, so they are visible as warnings rather than
      // silenced or hastily "fixed". Not a blanket exemption: raise it back to
      // error once those are addressed.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]

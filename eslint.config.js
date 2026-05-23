import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import stylistic from '@stylistic/eslint-plugin';
import { jsdoc } from 'eslint-plugin-jsdoc';

export default defineConfig([
  js.configs.recommended,
  stylistic.configs.customize({
    indent: 2,
    quotes: 'single',
    quoteProps: 'as-needed',
    arrowParens: true,
    semi: true,
  }),
  jsdoc({
    config: 'flat/recommended',
  }),
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
]);

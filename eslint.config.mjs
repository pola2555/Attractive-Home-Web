import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Git-ignored copies of old-repo source data (docs/DATABASE.md §8).
    'scripts/import/data/**',
    // One-off catalog supplier-analysis/data-migration scripts (archived; not
    // app code). They use `any` freely for ad-hoc row shaping — linting them
    // adds no value and would keep CI red over throwaway tooling.
    'scripts/catalog/**',
  ]),
]);

export default eslintConfig;

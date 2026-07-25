// Lowercase ASCII slugs — same rule as the one-time import (scripts/import/lib.ts
// §8 step 5), kept here so the dashboard and any app code share one definition.
// Pure function (no DB, no secrets) — safe to import anywhere.
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

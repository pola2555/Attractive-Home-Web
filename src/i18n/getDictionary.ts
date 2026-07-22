import type { Locale } from './config';

// UI-chrome strings live in code i18n files (docs/DATABASE.md §7) — these are
// the old site's namespaces, copied verbatim. Admin-editable marketing copy
// comes from content_blocks in the DB instead.
export type Namespace =
  | 'common'
  | 'about'
  | 'home'
  | 'contacts'
  | 'services'
  | 'catalog'
  | 'portfolio';

export type Dictionary = Record<string, unknown>;

export async function getDictionary(locale: Locale, namespace: Namespace): Promise<Dictionary> {
  const mod = (await import(`./locales/${locale}/${namespace}.json`)) as { default: Dictionary };
  return mod.default;
}

// Resolve a dotted path ("nav.about") in a dictionary; falls back to the last
// path segment so a missing key renders as readable text, never crashes.
export function t(dict: Dictionary, path: string): string {
  let node: unknown = dict;
  for (const part of path.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return path.split('.').pop() as string;
    }
  }
  return typeof node === 'string' ? node : (path.split('.').pop() as string);
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_REGISTRY,
  pageDef,
  pageKeyForContentKey,
  isSitePageKey,
  mergeState,
  resolveField,
  buildNavItems,
  buildFooterVisibility,
  assertHideable,
  SitePageError,
  flagsSchema,
  translationSchema,
  type SitePageKey,
  type PageState,
  type PageOverride,
  type TranslationRowInput,
} from './sitePages';

// Build a full states map from the registry defaults, then apply overrides.
function statesWith(overrides: Partial<Record<SitePageKey, Partial<PageState>>> = {}) {
  const out = {} as Record<SitePageKey, PageState>;
  for (const def of PAGE_REGISTRY) {
    out[def.key] = { ...mergeState(def, undefined), ...(overrides[def.key] ?? {}) };
  }
  return out;
}
function emptyOverrides() {
  const out = {} as Record<SitePageKey, PageOverride>;
  for (const def of PAGE_REGISTRY) out[def.key] = { navLabel: null, metaTitle: null, metaDescription: null };
  return out;
}
const codeLabel = (k: SitePageKey) => `code:${k}`;

test('mergeState: home is always published, even if a row says otherwise', () => {
  const home = pageDef('home')!;
  assert.equal(mergeState(home, { key: 'home', isPublished: false, showInNav: true, showInFooter: true, navSortOrder: 0 }).isPublished, true);
});

test('mergeState: a hideable page honors the stored isPublished flag', () => {
  const about = pageDef('about')!;
  assert.equal(mergeState(about, { key: 'about', isPublished: false, showInNav: true, showInFooter: true, navSortOrder: 1 }).isPublished, false);
  assert.equal(mergeState(about, undefined).isPublished, true); // default when no row
});

test('mergeState: defaults come from the registry when no row exists', () => {
  const about = pageDef('about')!;
  const s = mergeState(about, undefined);
  assert.deepEqual(s, { isPublished: true, showInNav: true, showInFooter: true, navSortOrder: 1 });
});

test('resolveField: requested locale wins, falls back to en, else null', () => {
  const rows: TranslationRowInput[] = [
    { localeCode: 'en', navLabel: 'About', metaTitle: null, metaDescription: null },
    { localeCode: 'ar', navLabel: 'حول', metaTitle: '  ', metaDescription: null },
  ];
  assert.equal(resolveField(rows, 'ar', 'navLabel'), 'حول');
  assert.equal(resolveField(rows, 'fr', 'navLabel'), 'About'); // fr absent → en
  assert.equal(resolveField(rows, 'ar', 'metaTitle'), null); // ar is whitespace → treated absent, en null
  assert.equal(resolveField([], 'en', 'navLabel'), null);
});

test('buildNavItems: filters hidden / out-of-menu pages and orders by navSortOrder', () => {
  const states = statesWith({ catalog: { isPublished: false }, contacts: { showInNav: false } });
  const items = buildNavItems(states, emptyOverrides(), codeLabel);
  const keys = items.map((i) => i.key);
  // home (not nav-eligible) and legal (footer-only) never appear; catalog hidden, contacts out of menu.
  assert.deepEqual(keys, ['about', 'portfolio', 'services']);
  // default labels come from the code dictionary.
  assert.equal(items[0].label, 'code:about');
});

test('buildNavItems: a DB override replaces the code label', () => {
  const states = statesWith();
  const overrides = emptyOverrides();
  overrides.about = { navLabel: 'Our Studio', metaTitle: null, metaDescription: null };
  const items = buildNavItems(states, overrides, codeLabel);
  assert.equal(items.find((i) => i.key === 'about')!.label, 'Our Studio');
});

test('buildNavItems: respects a reordered navSortOrder', () => {
  const states = statesWith({ services: { navSortOrder: 0 }, about: { navSortOrder: 9 } });
  const keys = buildNavItems(states, emptyOverrides(), codeLabel).map((i) => i.key);
  assert.equal(keys[0], 'services');
  assert.equal(keys[keys.length - 1], 'about');
});

test('buildFooterVisibility: footer-eligible + published + showInFooter', () => {
  const vis = buildFooterVisibility(statesWith({ services: { isPublished: false }, contacts: { showInFooter: false } }));
  assert.equal(vis.about, true);
  assert.equal(vis.services, false); // hidden
  assert.equal(vis.contacts, false); // toggled off
  assert.equal(vis.catalog, false); // not footer-eligible
  assert.equal(vis.home, false); // not footer-eligible
  assert.equal(vis.legal, true);
});

test('assertHideable: refuses home, allows the rest, rejects unknown', () => {
  assert.throws(() => assertHideable('home'), SitePageError);
  assert.throws(() => assertHideable('nope'), SitePageError);
  assert.doesNotThrow(() => assertHideable('about'));
  assert.doesNotThrow(() => assertHideable('catalog'));
});

test('pageKeyForContentKey maps a content block to its page', () => {
  assert.equal(pageKeyForContentKey('about.intro'), 'about');
  assert.equal(pageKeyForContentKey('home.subtitle'), 'home');
  assert.equal(pageKeyForContentKey('contact.address'), 'contacts');
  assert.equal(pageKeyForContentKey('visualizer.fact.1'), undefined); // not owned by a page
});

test('isSitePageKey', () => {
  assert.equal(isSitePageKey('about'), true);
  assert.equal(isSitePageKey('nope'), false);
});

test('flagsSchema parses booleans and ignores unknown keys', () => {
  const r = flagsSchema.parse({ isPublished: false, showInNav: true });
  assert.deepEqual(r, { isPublished: false, showInNav: true });
});

test('translationSchema: trims, blanks become null, over-long is rejected', () => {
  const r = translationSchema.parse({ navLabel: '  Studio  ', metaTitle: '', metaDescription: '   ' });
  assert.equal(r.navLabel, 'Studio');
  assert.equal(r.metaTitle, null);
  assert.equal(r.metaDescription, null);
  assert.throws(() => translationSchema.parse({ navLabel: 'x'.repeat(81) }));
});

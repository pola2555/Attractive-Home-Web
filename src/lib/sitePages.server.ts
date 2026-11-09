import 'server-only';
import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { prisma } from './prisma';
import { localeFilter } from './translate';
import { pageMetadata } from './seo';
import type { Locale } from '@/i18n/config';
import {
  PAGE_REGISTRY,
  mergeState,
  buildOverride,
  buildNavItems,
  buildFooterVisibility,
  type SitePageKey,
  type PageState,
  type PageOverride,
  type NavItem,
} from './sitePages';

export type SitePageConfig = {
  states: Record<SitePageKey, PageState>;
  overrides: Record<SitePageKey, PageOverride>;
};

// The whole page config for a locale in ONE query, cached per request. Rows
// missing from the DB fall back to code defaults; mergeState() forces home
// published so a bad DB row can never take the site's front door offline. A
// read failure degrades to all-default (the public site still renders).
export const getSitePageConfig = cache(async (locale: Locale): Promise<SitePageConfig> => {
  let rows: {
    key: string;
    isPublished: boolean;
    showInNav: boolean;
    showInFooter: boolean;
    navSortOrder: number;
    translations: {
      localeCode: string;
      navLabel: string | null;
      metaTitle: string | null;
      metaDescription: string | null;
    }[];
  }[] = [];
  try {
    rows = await prisma.sitePage.findMany({
      include: { translations: { where: localeFilter(locale) } },
    });
  } catch {
    rows = [];
  }
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const states = {} as Record<SitePageKey, PageState>;
  const overrides = {} as Record<SitePageKey, PageOverride>;
  for (const def of PAGE_REGISTRY) {
    const row = byKey.get(def.key);
    states[def.key] = mergeState(def, row);
    overrides[def.key] = buildOverride(row?.translations ?? [], locale);
  }
  return { states, overrides };
});

/** Whether a page is live. Home is always true. */
export async function isPagePublished(key: SitePageKey, locale: Locale): Promise<boolean> {
  const { states } = await getSitePageConfig(locale);
  return states[key]?.isPublished ?? true;
}

/** Call at the top of a public route: 404 the page when an admin has hidden it. */
export async function requirePagePublished(key: SitePageKey, locale: Locale): Promise<void> {
  if (!(await isPagePublished(key, locale))) notFound();
}

/** Resolved SEO override for a page, or nulls — merge over the page's defaults. */
export async function getPageMetaOverride(
  key: SitePageKey,
  locale: Locale,
): Promise<{ title: string | null; description: string | null }> {
  const { overrides } = await getSitePageConfig(locale);
  const o = overrides[key];
  return { title: o?.metaTitle ?? null, description: o?.metaDescription ?? null };
}

/**
 * Build page metadata, letting an admin's per-locale SEO title/description
 * override the page's own defaults. Drop-in for a page's generateMetadata.
 */
export async function pageMetaWithOverride(
  key: SitePageKey,
  opts: {
    locale: Locale;
    path: string;
    title?: string;
    description?: string;
    images?: string[];
    type?: 'website' | 'article';
  },
): Promise<Metadata> {
  const ov = await getPageMetaOverride(key, opts.locale);
  return pageMetadata({
    ...opts,
    title: ov.title ?? opts.title,
    description: ov.description ?? opts.description,
  });
}

/** Ordered, visible top-nav items for the locale, with resolved labels. */
export async function getNavItems(
  locale: Locale,
  codeLabel: (key: SitePageKey) => string,
): Promise<NavItem[]> {
  const { states, overrides } = await getSitePageConfig(locale);
  return buildNavItems(states, overrides, codeLabel);
}

/** Which footer-eligible pages are currently shown. */
export async function getFooterVisibility(
  locale: Locale,
): Promise<Record<SitePageKey, boolean>> {
  const { states } = await getSitePageConfig(locale);
  return buildFooterVisibility(states);
}

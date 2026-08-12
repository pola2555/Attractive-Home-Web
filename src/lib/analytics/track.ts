'use client';

import { LOCALES } from '@/i18n/config';

// Single entry point for all analytics events — pushes to window.dataLayer.
// No GA4/GTM specifics live here (destinations are configured inside GTM), so
// this mirrors the old site's src/analytics/track.js and stays portable. Admin
// (/dashboard) paths are never tracked.

type Params = Record<string, unknown>;

function stripLocale(path: string): string {
  const m = path.match(/^\/([^/]+)(\/.*|$)/);
  if (m && (LOCALES as readonly string[]).includes(m[1])) return m[2] || '/';
  return path || '/';
}

// Coarse page_type dimension from a locale-stripped path.
function pageType(path: string): string {
  const seg = path.replace(/^\/+/, '').split('/').filter(Boolean);
  const top = seg[0];
  if (!top) return 'home';
  switch (top) {
    case 'about':
      return 'about';
    case 'services':
      return 'services';
    case 'contacts':
      return 'contact';
    case 'catalog':
      return 'catalog';
    case 'products':
      return 'product';
    case 'portfolio':
      return seg.length > 1 ? 'portfolio_detail' : 'portfolio';
    case 'account':
      return 'account';
    default:
      return 'other';
  }
}

export function track(event: string, params: Params = {}, ctx?: { locale?: string; path?: string }): void {
  if (typeof window === 'undefined') return;
  const path = ctx?.path ?? window.location.pathname;
  if (/^\/dashboard(\/|$)/.test(path)) return; // never track the admin dashboard
  const w = window as unknown as { dataLayer?: Record<string, unknown>[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({
    event,
    content_language: ctx?.locale,
    page_path: path,
    page_type: pageType(stripLocale(path)),
    ...params,
  });
}

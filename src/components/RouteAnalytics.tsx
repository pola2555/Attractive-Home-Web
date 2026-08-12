'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { track } from '@/lib/analytics/track';

// Fires a page_view on every client navigation (GA4 in GTM runs with
// send_page_view=false, so this is the single source of page views) and a
// language_change when the locale prefix changes. Mounted once in the locale
// layout; renders nothing.
export default function RouteAnalytics({ locale }: { locale: string }) {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);
  const lastLocale = useRef<string>(locale);

  useEffect(() => {
    if (lastPath.current === pathname) return;

    if (lastLocale.current !== locale) {
      track('language_change', { from: lastLocale.current, to: locale }, { locale, path: pathname });
      lastLocale.current = locale;
    }

    track(
      'page_view',
      { page_location: window.location.href, page_title: document.title },
      { locale, path: pathname },
    );
    lastPath.current = pathname;
  }, [pathname, locale]);

  return null;
}

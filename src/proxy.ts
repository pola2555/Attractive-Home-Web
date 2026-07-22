import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/config';

// Locale routing: every page URL carries a locale prefix (/en, /ar, /fr, /ru —
// docs/DATABASE.md §8 step 5). Un-prefixed paths (including all old-site URLs
// like /catalog or /portfolio/interior) redirect to the visitor's language:
// cookie choice first, then Accept-Language, then English.
function detectLocale(request: NextRequest): Locale {
  const cookie = request.cookies.get('lang')?.value;
  if (isLocale(cookie)) return cookie;
  const header = request.headers.get('accept-language') ?? '';
  for (const part of header.split(',')) {
    const code = part.split(';')[0].trim().slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split('/')[1];

  if (isLocale(first)) {
    // Remember the visited locale so future un-prefixed visits keep it.
    const response = NextResponse.next();
    if (request.cookies.get('lang')?.value !== first) {
      response.cookies.set('lang', first, { path: '/', maxAge: 60 * 60 * 24 * 365 });
    }
    return response;
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${detectLocale(request)}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  // Skip Next internals, API routes, the (English-only) dashboard and static
  // files (anything with a dot).
  matcher: ['/((?!_next|api|dashboard|.*\\..*).*)'],
};

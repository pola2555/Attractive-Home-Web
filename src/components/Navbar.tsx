'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LOCALES, LOCALE_SHORT, type Locale } from '@/i18n/config';

// Ported from the old Navbar.jsx: transparent blurred bar, collapse-on-scroll
// on the catalog page only, EN/AR logo variants, language pill dropdown.
// Language switching now swaps the URL's locale prefix (SEO-correct — every
// language is its own URL) instead of flipping client i18n state.

export type NavbarLabels = {
  about: string;
  portfolio: string;
  catalog: string;
  contacts: string;
  services: string;
  languageLabel: string;
  languageNames: Record<Locale, string>;
};

const NAV_ITEMS: { key: keyof Omit<NavbarLabels, 'languageLabel' | 'languageNames'>; path: string }[] = [
  { key: 'about', path: '/about' },
  { key: 'portfolio', path: '/portfolio' },
  { key: 'catalog', path: '/catalog' },
  { key: 'contacts', path: '/contacts' },
  { key: 'services', path: '/services' },
];

export default function Navbar({ locale, labels }: { locale: Locale; labels: NavbarLabels }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const langRef = useRef<HTMLDivElement | null>(null);
  const lastYRef = useRef(0);
  const pathname = usePathname() ?? `/${locale}`;

  const isCatalog = pathname.startsWith(`/${locale}/catalog`);
  const isCatalogRef = useRef(isCatalog);
  useEffect(() => {
    isCatalogRef.current = isCatalog;
  }, [isCatalog]);
  // Collapse only ever applies on the catalog page — derived, not synced state.
  const collapsed = hidden && isCatalog && !menuOpen;

  // Collapse on scroll-down / reveal on fast scroll-up — catalog page only.
  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = Math.max(0, window.scrollY);
      const delta = y - lastYRef.current;
      lastYRef.current = y;
      if (!isCatalogRef.current) return;
      if (y < 90) setHidden(false);
      else if (delta > 2) setHidden(true);
      else if (delta < -22) setHidden(false);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the language dropdown on outside click.
  useEffect(() => {
    if (!langOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [langOpen]);

  const href = (path: string) => `/${locale}${path}`;
  const isActive = (path: string) => (pathname === href(path) ? 'text-heading' : 'text-ink');
  // Same page in another language: swap the locale prefix.
  const localizedPath = (code: Locale) => {
    const rest = pathname.replace(new RegExp(`^/${locale}(?=/|$)`), '');
    return `/${code}${rest}`;
  };

  const logoSrc = locale === 'ar' ? '/Logo AR.webp' : '/Logo EN.webp';

  return (
    <nav
      className={`fixed top-0 w-full flex justify-between items-center px-4 sm:px-6 lg:px-10 py-5 z-[1000] text-ink transition-all duration-300 ${
        collapsed ? '-translate-y-full' : 'translate-y-0'
      } bg-transparent border-0 shadow-none`}
      style={{ backdropFilter: 'blur(6px)' }}
    >
      <Link href={`/${locale}`} className="flex items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="Attractive Home" className="ah-navbar-logo h-16 sm:h-18 md:h-20 w-auto" />
      </Link>

      {/* Desktop links */}
      <div className="hidden md:flex items-center gap-x-14 text-ink">
        {NAV_ITEMS.map((item) => (
          <Link key={item.key} href={href(item.path)} className={`hover:text-accent ${isActive(item.path)}`}>
            {labels[item.key]}
          </Link>
        ))}
        <div className="relative" ref={langRef}>
          <button
            onClick={() => setLangOpen((v) => !v)}
            aria-label={labels.languageLabel}
            aria-haspopup="listbox"
            aria-expanded={langOpen}
            className="flex items-center gap-1.5 border border-accent-2/60 rounded-full px-3 py-1 text-sm hover:bg-accent-2/10 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" />
            </svg>
            <span>{LOCALE_SHORT[locale]}</span>
          </button>
          {langOpen && (
            <ul
              className="absolute end-0 mt-2 min-w-[10rem] rounded-xl bg-bg/95 backdrop-blur-md border border-accent-2/30 shadow-lg py-1 z-[1100]"
              role="listbox"
            >
              {LOCALES.map((code) => (
                <li key={code}>
                  <Link
                    role="option"
                    aria-selected={code === locale}
                    href={localizedPath(code)}
                    onClick={() => setLangOpen(false)}
                    className={`block w-full text-start px-4 py-2 text-sm hover:bg-accent-2/10 transition-colors ${
                      code === locale ? 'text-heading font-semibold' : 'text-ink'
                    }`}
                  >
                    {labels.languageNames[code]}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Mobile menu button */}
      <button className="md:hidden text-ink focus:outline-none" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d={menuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'}
          />
        </svg>
      </button>

      {/* Mobile links */}
      {menuOpen && (
        <div className="absolute top-full left-0 w-full bg-bg/90 flex flex-col items-center space-y-5 py-5 md:hidden">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={href(item.path)}
              className={`hover:text-accent ${isActive(item.path)}`}
              onClick={() => setMenuOpen(false)}
            >
              {labels[item.key]}
            </Link>
          ))}
          <div className="flex items-center gap-2 flex-wrap justify-center px-4">
            {LOCALES.map((code) => (
              <Link
                key={code}
                href={localizedPath(code)}
                onClick={() => setMenuOpen(false)}
                aria-label={labels.languageNames[code]}
                className={`border rounded-full px-4 py-1 text-sm transition-colors ${
                  code === locale
                    ? 'border-accent-2 bg-accent-2/15 text-heading'
                    : 'border-accent-2/60 text-ink hover:bg-accent-2/10'
                }`}
              >
                {labels.languageNames[code]}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

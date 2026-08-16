'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// A "back" affordance for sub-pages. Preference: return the visitor to the page
// they came from (browser back). But a back that would leave the site — because
// they arrived via a direct/search link with no in-site history — is useless, so
// in that case we fall back to the section's parent page instead.
//
// It renders a real <Link href={parent}> so it works without JS, is crawlable,
// and supports open-in-new-tab; the click handler only *upgrades* it to a true
// browser-back when we can prove there is in-site history to go back to.
//
// Detecting "in-site history": we record window.history.length the first time a
// back-able page is shown in this tab. Anything navigated to afterwards sits
// above that baseline, so history.back() is guaranteed to stay within the site.
// On the very first sub-page (or a direct external landing) there is no such
// history yet, so we use the parent link.

const BASE_KEY = 'ah:histBaseline';

export default function BackLink({
  href,
  label,
  className = '',
}: {
  href: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    try {
      if (sessionStorage.getItem(BASE_KEY) === null) {
        sessionStorage.setItem(BASE_KEY, String(window.history.length));
      }
    } catch {
      /* sessionStorage blocked (private mode) — always use the parent link */
    }
  }, []);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Let modified / non-primary clicks behave as an ordinary link.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    let hasInSiteHistory = false;
    try {
      const base = sessionStorage.getItem(BASE_KEY);
      hasInSiteHistory = base !== null && window.history.length > Number(base);
    } catch {
      hasInSiteHistory = false;
    }
    if (hasInSiteHistory) {
      e.preventDefault();
      router.back();
    }
    // Otherwise fall through to the <Link>, which goes to the parent page.
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={`group inline-flex items-center gap-1.5 ${className}`}
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:translate-x-0.5"
      >
        <path
          d="M12.5 4.5 7 10l5.5 5.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </Link>
  );
}

'use client';

import { useEffect, useState, type ReactNode } from 'react';

// Responsive wrapper for the filter sidebar. On mobile the filters collapse
// behind a "Filters" button and open as a slide-in drawer (backdrop + close +
// "view results"); on desktop (lg+) it's the static left column. The filter
// content itself is server-rendered (crawlable links) and passed in as
// children — rendered once, just re-styled per breakpoint. The drawer keeps its
// open state across filter taps (client navigation preserves it), so several
// filters can be chosen before closing.
export default function CatalogFilters({
  children,
  filtersLabel,
  closeLabel,
  viewResultsLabel,
  activeCount,
}: {
  children: ReactNode;
  filtersLabel: string;
  closeLabel: string;
  viewResultsLabel: string;
  activeCount: number;
}) {
  const [open, setOpen] = useState(false);

  // While the drawer is open: lock background scroll + close on Escape.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div>
      {/* Mobile trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-controls="catalog-filter-panel"
        aria-expanded={open}
        className="lg:hidden inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-line-strong bg-surface text-ink font-medium"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h18M6 12h12M10 19h4" />
        </svg>
        {filtersLabel}
        {activeCount > 0 && (
          <span className="ms-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-accent text-white text-xs">
            {activeCount}
          </span>
        )}
      </button>

      {/* Backdrop (mobile only, when open) */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Panel: fixed drawer on mobile, static column on desktop. */}
      <div
        id="catalog-filter-panel"
        className={`fixed inset-y-0 start-0 z-50 w-[85%] max-w-sm overflow-y-auto bg-bg p-5 shadow-2xl transition-transform duration-300 lg:static lg:z-auto lg:w-auto lg:max-w-none lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
        }`}
      >
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between mb-4">
          <span className="font-semibold text-heading">
            {filtersLabel}
            {activeCount > 0 ? ` (${activeCount})` : ''}
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={closeLabel}
            className="text-3xl leading-none text-muted hover:text-ink"
          >
            ×
          </button>
        </div>

        {children}

        {/* Mobile footer */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="lg:hidden mt-6 w-full py-2.5 rounded-lg bg-brand-brown text-white font-semibold"
        >
          {viewResultsLabel}
        </button>
      </div>
    </div>
  );
}

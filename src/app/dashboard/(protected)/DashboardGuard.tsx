'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Guards against losing unsaved edits. A form registers itself (via
// <UnsavedChangesGuard/>) with a `isDirty()` probe and a `requestSubmit()`
// action. While a registered form is dirty:
//   - clicking any in-app link is intercepted and a Save / Discard / Keep-editing
//     dialog is shown instead of navigating;
//   - a full-page unload (refresh, tab close, external link) triggers the
//     browser's native "leave site?" prompt.
// This is the conventional App-Router pattern: there is no built-in soft-nav
// blocker, so we intercept anchor clicks in the capture phase. The browser back
// button is intentionally left to the native beforeunload prompt on hard nav.

type Registration = { isDirty: () => boolean; requestSubmit: () => void };

type GuardApi = {
  register: (reg: Registration) => void;
  unregister: (reg: Registration) => void;
};

const GuardContext = createContext<GuardApi | null>(null);

export function useDashboardGuard(): GuardApi {
  const ctx = useContext(GuardContext);
  if (!ctx) throw new Error('useDashboardGuard must be used within <DashboardGuard>');
  return ctx;
}

export default function DashboardGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const regsRef = useRef<Set<Registration>>(new Set());
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const register = useCallback((reg: Registration) => {
    regsRef.current.add(reg);
  }, []);
  const unregister = useCallback((reg: Registration) => {
    regsRef.current.delete(reg);
  }, []);

  const dirtyReg = useCallback((): Registration | null => {
    for (const reg of regsRef.current) if (reg.isDirty()) return reg;
    return null;
  }, []);

  // Intercept in-app link clicks while a form is dirty.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // Same page (e.g. hash / no-op) — let it through.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!dirtyReg()) return;
      // preventDefault alone isn't enough: Next's <Link> navigates from its own
      // React handler, so stop the event reaching it too.
      e.preventDefault();
      e.stopImmediatePropagation();
      setPendingHref(url.pathname + url.search + url.hash);
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirtyReg]);

  // Native prompt for full-page unloads (refresh / close / external nav).
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirtyReg()) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirtyReg]);

  const closeDialog = () => setPendingHref(null);

  const discard = () => {
    const href = pendingHref;
    regsRef.current.clear(); // the leaving form is being abandoned
    setPendingHref(null);
    if (href) router.push(href);
  };

  const save = () => {
    dirtyReg()?.requestSubmit(); // the action redirects on success
    setPendingHref(null);
  };

  return (
    <GuardContext.Provider value={{ register, unregister }}>
      {children}
      {pendingHref !== null && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="unsaved-title"
          onClick={closeDialog}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line-strong bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="unsaved-title" className="text-lg font-semibold text-heading">
              Unsaved changes
            </h2>
            <p className="mt-2 text-sm text-muted">
              You have changes that haven&apos;t been saved. What would you like to do?
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-lg px-4 py-2 text-sm text-ink hover:bg-accent-2/10"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={discard}
                className="rounded-lg border border-line px-4 py-2 text-sm text-red-300 hover:bg-red-500/10"
              >
                Discard changes
              </button>
              <button
                type="button"
                onClick={save}
                className="rounded-lg bg-brand-brown px-4 py-2 text-sm text-white hover:bg-brand-brown-hover"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </GuardContext.Provider>
  );
}

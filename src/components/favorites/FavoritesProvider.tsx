'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { toggleFavorite, mergeFavorites } from './actions';

// Client store for a logged-in customer's server favorites. It hydrates itself
// from /api/account/favorites AFTER mount, so the public pages stay static/ISR
// (reading the session cookie in the layout would force every page dynamic).
// On first login it merges the anonymous localStorage shortlist (ahc_short)
// into the account. Anonymous visitors stay authed=false and the cards fall
// back to their localStorage shortlist behaviour.

type Ctx = {
  authed: boolean;
  ids: string[];
  has: (id: string) => boolean;
  toggle: (id: string) => void;
};

const FavoritesContext = createContext<Ctx>({ authed: false, ids: [], has: () => false, toggle: () => {} });
export const useFavorites = () => useContext(FavoritesContext);

const SHORTLIST_KEY = 'ahc_short';
const MERGED_FLAG = 'ahc_fav_merged';

export default function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const [, startTransition] = useTransition();
  const pathname = usePathname();
  const probedPath = useRef<string | null>(null);

  // Re-check the session whenever the route changes. Signing in or out ends in a
  // redirect (a soft client navigation that keeps this provider mounted), so a
  // once-on-mount fetch would leave the ♥ cards and navbar stale until a manual
  // reload. The ref keeps this to one fetch per distinct path (and dodges the
  // double-invoke of dev strict mode).
  useEffect(() => {
    if (probedPath.current === pathname) return;
    probedPath.current = pathname;
    void (async () => {
      let data: { authed: boolean; ids: string[] } = { authed: false, ids: [] };
      try {
        const res = await fetch('/api/account/favorites', { cache: 'no-store' });
        if (res.ok) data = await res.json();
      } catch {
        // offline / not signed in — stay anonymous
      }
      let set = new Set(data.ids);
      if (data.authed && !localStorage.getItem(MERGED_FLAG)) {
        let local: unknown = [];
        try {
          local = JSON.parse(localStorage.getItem(SHORTLIST_KEY) || '[]');
        } catch {
          local = [];
        }
        const localIds = Array.isArray(local) ? local.filter((x): x is string => typeof x === 'string') : [];
        const merged = await mergeFavorites(localIds);
        if (merged.authed) {
          set = new Set(merged.ids);
          localStorage.setItem(MERGED_FLAG, '1');
        }
      }
      setAuthed(data.authed);
      setIds(set);
    })();
  }, [pathname]);

  const has = (id: string) => ids.has(id);
  // Stable array reference (only changes when the set changes) so consumers can
  // safely use it as an effect dependency.
  const idList = useMemo(() => [...ids], [ids]);

  const toggle = (id: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    startTransition(async () => {
      const res = await toggleFavorite(id);
      if (!res.authed) return;
      setIds((prev) => {
        const next = new Set(prev);
        if (res.favorited) next.add(id);
        else next.delete(id);
        return next;
      });
    });
  };

  return (
    <FavoritesContext.Provider value={{ authed, ids: idList, has, toggle }}>{children}</FavoritesContext.Provider>
  );
}

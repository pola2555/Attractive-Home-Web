'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import SmartImage from './SmartImage';
import { SAVE_KEY, COMPARE_KEY, useIds, removeId, clearKey } from './shortlistStore';
import { useFavorites } from './favorites/FavoritesProvider';

type Item = {
  id: string;
  slug: string;
  code: string | null;
  name: string;
  image: { src: string; fallback: string | null } | null;
  type: string | null;
  material: string | null;
  look: string | null;
  finish: string | null;
  collection: string | null;
  brand: string | null;
  size: string | null;
  color: { name: string | null; hex: string | null } | null;
  applications: (string | null)[];
  source: string;
};

export type ShortlistLabels = {
  compare: string;
  compareNow: string;
  clear: string;
  saved: string;
  copyCodes: string;
  copied: string;
  noSaved: string;
  close: string;
  spec: {
    type: string;
    material: string;
    look: string;
    color: string;
    finish: string;
    size: string;
    application: string;
    collection: string;
    brand: string;
  };
};

export default function ShortlistBar({ locale, labels }: { locale: string; labels: ShortlistLabels }) {
  // Saved list follows the same source as the card ♥: server favorites when the
  // customer is signed in, otherwise the anonymous localStorage shortlist.
  // Compare is always localStorage.
  const favorites = useFavorites();
  const localSavedIds = useIds(SAVE_KEY);
  const savedIds = favorites.authed ? favorites.ids : localSavedIds;
  const removeSaved = (id: string) => (favorites.authed ? favorites.toggle(id) : removeId(SAVE_KEY, id));
  const compareIds = useIds(COMPARE_KEY);
  const [items, setItems] = useState<Record<string, Item>>({});
  const [overlay, setOverlay] = useState<null | 'compare' | 'short'>(null);
  const [copied, setCopied] = useState(false);
  const attempted = useRef<Set<string>>(new Set());

  // Fetch any ids we haven't got yet (once each); merge so a removal never refetches.
  useEffect(() => {
    const ids = Array.from(new Set([...savedIds, ...compareIds]));
    const missing = ids.filter((id) => !items[id] && !attempted.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => attempted.current.add(id));
    let cancelled = false;
    fetch(`/api/catalog/by-ids?locale=${locale}&ids=${missing.join(',')}`)
      .then((r) => r.json())
      .then((data: { items: Item[] }) => {
        if (cancelled) return;
        setItems((prev) => {
          const next = { ...prev };
          for (const it of data.items) next[it.id] = it;
          return next;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [savedIds, compareIds, items, locale]);

  if (savedIds.length === 0 && compareIds.length === 0) return null;

  const copyCodes = async () => {
    const codes = savedIds
      .map((id) => items[id]?.code)
      .filter(Boolean)
      .join(', ');
    if (!codes) return;
    try {
      await navigator.clipboard.writeText(codes);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  const accentBtn = 'rounded-xl px-4 py-2 font-bold bg-accent text-white hover:brightness-110 transition';
  const ghostBtn = 'rounded-xl px-4 py-2 font-bold bg-transparent text-ink border border-line hover:border-accent/60 transition';

  const compareCols = compareIds.map((id) => items[id]).filter((it): it is Item => Boolean(it));
  const rows: { label: string; get: (it: Item) => string | null }[] = [
    { label: labels.spec.type, get: (it) => it.type },
    { label: labels.spec.material, get: (it) => it.material },
    { label: labels.spec.look, get: (it) => it.look },
    { label: labels.spec.color, get: (it) => it.color?.name ?? null },
    { label: labels.spec.finish, get: (it) => it.finish },
    { label: labels.spec.size, get: (it) => it.size },
    { label: labels.spec.application, get: (it) => it.applications.filter(Boolean).join(', ') || null },
    { label: labels.spec.collection, get: (it) => it.collection },
    { label: labels.spec.brand, get: (it) => it.brand },
  ];

  return (
    <>
      {/* Saved pill */}
      {savedIds.length > 0 && (
        <button
          type="button"
          onClick={() => setOverlay('short')}
          className="fixed bottom-4 start-4 z-[1040] rounded-full px-4 py-2 text-sm font-bold bg-surface border border-line shadow-lg text-ink hover:border-accent/60"
        >
          ♥ {labels.saved} ({savedIds.length})
        </button>
      )}

      {/* Compare tray */}
      {compareIds.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-[1050] bg-surface border-t border-line shadow-[0_-6px_24px_rgba(0,0,0,.35)]">
          <div className="flex items-center gap-3 px-4 sm:px-6 py-3 max-w-[1580px] mx-auto">
            <b className="text-heading shrink-0">{labels.compare}</b>
            <div className="flex gap-2.5 flex-1 overflow-auto">
              {compareIds.map((id) => {
                const it = items[id];
                return (
                  <div
                    key={id}
                    className="flex gap-2 items-center bg-surface-2 rounded-[10px] ps-1.5 pe-2 py-1.5 whitespace-nowrap text-ink"
                  >
                    {it?.image && (
                      <SmartImage
                        src={it.image.src}
                        fallbackSrc={it.image.fallback}
                        alt=""
                        className="w-[34px] h-[34px] rounded-[7px] object-cover"
                      />
                    )}
                    <span className="text-sm max-w-[10rem] truncate">{it?.name ?? '…'}</span>
                    <button
                      type="button"
                      aria-label={labels.close}
                      onClick={() => removeId(COMPARE_KEY, id)}
                      className="text-muted hover:text-ink"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => clearKey(COMPARE_KEY)} className={`${ghostBtn} shrink-0`}>
              {labels.clear}
            </button>
            <button type="button" onClick={() => setOverlay('compare')} className={`${accentBtn} shrink-0`}>
              {labels.compareNow}
            </button>
          </div>
        </div>
      )}

      {/* Overlay: compare table / shortlist */}
      {overlay && (
        <div
          className="fixed inset-0 z-[1120] bg-black/65 flex items-center justify-center p-4 sm:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOverlay(null);
          }}
        >
          <div className="relative bg-bg border border-line rounded-[18px] max-w-[1200px] w-full max-h-[88vh] overflow-auto p-6">
            <button
              type="button"
              aria-label={labels.close}
              onClick={() => setOverlay(null)}
              className="absolute top-4 end-4 w-9 h-9 rounded-[10px] bg-surface text-ink shadow flex items-center justify-center text-xl"
            >
              ×
            </button>

            {overlay === 'compare' && (
              <>
                <h2 className="text-heading text-xl font-bold mb-4">
                  {labels.compare} ({compareCols.length})
                </h2>
                <div className="overflow-auto">
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr>
                        <th className="border border-line p-2.5" />
                        {compareCols.map((it) => (
                          <th key={it.id} className="border border-line p-2.5 text-start bg-surface text-heading">
                            {it.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th className="border border-line p-2.5 bg-surface" />
                        {compareCols.map((it) => (
                          <td key={it.id} className="border border-line p-2.5 align-top">
                            {it.image && (
                              <SmartImage
                                src={it.image.src}
                                fallbackSrc={it.image.fallback}
                                alt={it.name}
                                className="w-[120px] h-[120px] object-cover rounded-[10px]"
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                      {rows.map((row) => (
                        <tr key={row.label}>
                          <th className="border border-line p-2.5 text-start bg-surface text-ink whitespace-nowrap">
                            {row.label}
                          </th>
                          {compareCols.map((it) => (
                            <td key={it.id} className="border border-line p-2.5 align-top text-ink">
                              {row.get(it) || <span className="text-muted">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {overlay === 'short' && (
              <>
                <h2 className="text-heading text-xl font-bold mb-4">
                  {labels.saved} ({savedIds.length})
                </h2>
                {savedIds.length === 0 ? (
                  <p className="text-muted">{labels.noSaved}</p>
                ) : (
                  <>
                    <button type="button" onClick={copyCodes} className={copied ? `${accentBtn} !bg-green-600` : accentBtn}>
                      {copied ? `✓ ${labels.copied}` : labels.copyCodes}
                    </button>
                    <div
                      className="grid gap-[18px] mt-5"
                      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
                    >
                      {savedIds.map((id) => {
                        const it = items[id];
                        if (!it) return null;
                        return (
                          <div
                            key={id}
                            className="relative group bg-surface rounded-lg overflow-hidden border border-line"
                          >
                            <div className="relative aspect-square bg-surface-2">
                              {it.image && (
                                <SmartImage
                                  src={it.image.src}
                                  fallbackSrc={it.image.fallback}
                                  alt={it.name}
                                  className="w-full h-full object-cover"
                                />
                              )}
                              <button
                                type="button"
                                aria-label={labels.close}
                                onClick={() => removeSaved(id)}
                                className="absolute top-2 end-2 w-7 h-7 rounded-lg bg-on-media/95 text-on-accent shadow flex items-center justify-center"
                              >
                                ✕
                              </button>
                              <Link
                                href={`/${locale}/products/${it.slug}`}
                                aria-label={it.name}
                                className="absolute inset-0"
                              />
                            </div>
                            <div className="p-2.5">
                              <p className="text-ink text-sm font-bold truncate" title={it.name}>
                                {it.name}
                              </p>
                              {it.code && <p className="text-muted text-xs mt-0.5 truncate">{it.code}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

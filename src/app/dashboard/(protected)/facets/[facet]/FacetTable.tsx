'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LOCALES, type Locale } from '@/i18n/config';
import type { FacetType, FacetValue } from '@/lib/facetsAdmin';
import { saveFacetInline, toggleFacet, moveFacetInline, deleteFacetInline } from './actions';

// Inline-editable facet vocabulary table. Every value is edited in place — code,
// English name, other-locale names (expandable), colour, active state, order —
// with no page navigation. A persistent bottom row adds new values.

const LOCALE_LABEL: Record<Locale, string> = { en: 'English', ar: 'Arabic', fr: 'French', ru: 'Russian' };
const OTHER_LOCALES = LOCALES.filter((l) => l !== 'en');

const cellInput =
  'w-full px-2 py-1 bg-surface text-ink rounded border border-line-strong focus:outline-none focus:ring-1 focus:ring-accent';
const iconBtn = 'w-7 h-7 grid place-items-center rounded border border-line text-ink hover:border-accent/60 disabled:opacity-30';

function emptyNames(): Record<Locale, string> {
  return Object.fromEntries(LOCALES.map((l) => [l, ''])) as Record<Locale, string>;
}

export default function FacetTable({
  facet,
  values,
  hasHex,
  singular,
  canWrite,
}: {
  facet: FacetType;
  values: FacetValue[];
  hasHex: boolean;
  singular: string;
  canWrite: boolean;
}) {
  const [error, setError] = useState('');

  return (
    <div className="space-y-4">
      {error && (
        <p className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-200 text-sm">{error}</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-muted bg-surface/60 border-b border-line">
              {canWrite && <th className="w-16 py-2.5 px-2 text-center font-medium">Order</th>}
              {hasHex && <th className="w-14 py-2.5 px-2 text-center font-medium">Colour</th>}
              <th className="text-start py-2.5 px-2 font-medium">Code</th>
              <th className="text-start py-2.5 px-2 font-medium">Name (English)</th>
              <th className="w-20 py-2.5 px-2 text-center font-medium">Uses</th>
              <th className="w-24 py-2.5 px-2 text-center font-medium">Status</th>
              {canWrite && <th className="w-40 py-2.5 px-2 text-end font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {values.map((v, i) => (
              <Row
                key={`${v.id}:${v.sortOrder}:${v.code}:${v.isActive}:${JSON.stringify(v.names)}`}
                facet={facet}
                value={v}
                hasHex={hasHex}
                canWrite={canWrite}
                isFirst={i === 0}
                isLast={i === values.length - 1}
                onError={setError}
              />
            ))}
            {values.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted">
                  No values yet — add the first one below.
                </td>
              </tr>
            )}
            {canWrite && (
              <AddRow facet={facet} hasHex={hasHex} singular={singular} nextOrder={values.length} onError={setError} />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  facet,
  value,
  hasHex,
  canWrite,
  isFirst,
  isLast,
  onError,
}: {
  facet: FacetType;
  value: FacetValue;
  hasHex: boolean;
  canWrite: boolean;
  isFirst: boolean;
  isLast: boolean;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState(value.code);
  const [names, setNames] = useState<Record<Locale, string>>({ ...value.names });
  const [hex, setHex] = useState(value.hex ?? '#000000');
  const [expanded, setExpanded] = useState(false);

  const dirty =
    canWrite &&
    (code !== value.code ||
      (hasHex && hex !== (value.hex ?? '#000000')) ||
      LOCALES.some((l) => (names[l] ?? '') !== (value.names[l] ?? '')));

  const setName = (l: Locale, val: string) => setNames((prev) => ({ ...prev, [l]: val }));

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, refreshOnOk = true) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        onError(res.error ?? 'Something went wrong.');
        return;
      }
      onError('');
      if (refreshOnOk) router.refresh();
    });

  const save = () =>
    run(() =>
      saveFacetInline(facet, value.id, {
        code: code.trim(),
        isActive: value.isActive,
        hex: hasHex ? hex : null,
        names,
        sortOrder: value.sortOrder, // preserve current order on an edit
      }),
    );

  const revert = () => {
    setCode(value.code);
    setNames({ ...value.names });
    setHex(value.hex ?? '#000000');
    onError('');
  };

  const remove = () => {
    if (!window.confirm(`Delete "${value.code}"? Products using it keep working (the link is cleared).`)) return;
    run(() => deleteFacetInline(facet, value.id));
  };

  return (
    <>
      <tr className="border-b border-line/50 align-middle">
        {canWrite && (
          <td className="py-1.5 px-2">
            <div className="flex items-center justify-center gap-1">
              <button type="button" aria-label="Move up" disabled={isFirst || pending} onClick={() => run(() => moveFacetInline(facet, value.id, 'up'))} className={iconBtn}>
                ↑
              </button>
              <button type="button" aria-label="Move down" disabled={isLast || pending} onClick={() => run(() => moveFacetInline(facet, value.id, 'down'))} className={iconBtn}>
                ↓
              </button>
            </div>
          </td>
        )}
        {hasHex && (
          <td className="py-1.5 px-2 text-center">
            {canWrite ? (
              <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent" aria-label="Colour" />
            ) : (
              <span className="inline-block w-5 h-5 rounded-full border border-line-strong align-middle" style={{ backgroundColor: value.hex ?? 'transparent' }} />
            )}
          </td>
        )}
        <td className="py-1.5 px-2">
          {canWrite ? (
            <input value={code} onChange={(e) => setCode(e.target.value)} className={`${cellInput} font-mono`} aria-label="Code" />
          ) : (
            <span className="font-mono">{value.code}</span>
          )}
        </td>
        <td className="py-1.5 px-2">
          <div className="flex items-center gap-2">
            {canWrite ? (
              <input value={names.en} onChange={(e) => setName('en', e.target.value)} className={cellInput} aria-label="English name" />
            ) : (
              <span>{value.name}</span>
            )}
            {canWrite && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                title="Other languages"
                className="shrink-0 text-xs text-muted hover:text-accent whitespace-nowrap"
              >
                {expanded ? '▴ langs' : '▾ langs'}
              </button>
            )}
          </div>
        </td>
        <td className="py-1.5 px-2 text-center text-muted">{value.uses}</td>
        <td className="py-1.5 px-2 text-center">
          {canWrite ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => toggleFacet(facet, value.id, !value.isActive))}
              className={`px-2 py-0.5 rounded-full text-xs border ${value.isActive ? 'border-green-500/50 text-green-300' : 'border-line text-muted'}`}
            >
              {value.isActive ? 'Active' : 'Hidden'}
            </button>
          ) : value.isActive ? (
            'Active'
          ) : (
            'Hidden'
          )}
        </td>
        {canWrite && (
          <td className="py-1.5 px-2">
            <div className="flex items-center justify-end gap-2">
              {dirty ? (
                <>
                  <button type="button" disabled={pending} onClick={save} className="px-3 py-1 rounded bg-brand-brown hover:bg-brand-brown-hover text-white text-xs disabled:opacity-60">
                    Save
                  </button>
                  <button type="button" disabled={pending} onClick={revert} className="text-muted hover:text-ink text-xs">
                    Revert
                  </button>
                </>
              ) : (
                <button type="button" disabled={pending} onClick={remove} aria-label="Delete" className="text-red-300 hover:text-red-200 text-sm">
                  Delete
                </button>
              )}
            </div>
          </td>
        )}
      </tr>
      {canWrite && expanded && (
        <tr className="border-b border-line/50 bg-surface/40">
          <td colSpan={hasHex ? 3 : 2} />
          <td colSpan={4} className="py-2 px-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {OTHER_LOCALES.map((l) => (
                <label key={l} className="block">
                  <span className="block text-xs text-muted mb-1">{LOCALE_LABEL[l]}</span>
                  <input value={names[l]} onChange={(e) => setName(l, e.target.value)} dir={l === 'ar' ? 'rtl' : 'ltr'} className={cellInput} />
                </label>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function AddRow({
  facet,
  hasHex,
  singular,
  nextOrder,
  onError,
}: {
  facet: FacetType;
  hasHex: boolean;
  singular: string;
  nextOrder: number;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [hex, setHex] = useState('#808080');

  const add = () => {
    if (!code.trim() || !nameEn.trim()) {
      onError('A new value needs a code and an English name.');
      return;
    }
    start(async () => {
      const res = await saveFacetInline(facet, null, {
        code: code.trim(),
        isActive: true,
        hex: hasHex ? hex : null,
        names: { ...emptyNames(), en: nameEn.trim() },
        sortOrder: nextOrder,
      });
      if (!res.ok) {
        onError(res.error ?? 'Could not add the value.');
        return;
      }
      onError('');
      setCode('');
      setNameEn('');
      setHex('#808080');
      router.refresh();
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  };

  return (
    <tr className="bg-surface/30">
      <td className="py-2 px-2 text-center text-muted text-xs">new</td>
      {hasHex && (
        <td className="py-2 px-2 text-center">
          <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent" aria-label="Colour" />
        </td>
      )}
      <td className="py-2 px-2">
        <input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={onKeyDown} placeholder="code" className={`${cellInput} font-mono`} />
      </td>
      <td className="py-2 px-2">
        <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} onKeyDown={onKeyDown} placeholder={`New ${singular.toLowerCase()} name`} className={cellInput} />
      </td>
      <td />
      <td />
      <td className="py-2 px-2">
        <div className="flex justify-end">
          <button type="button" disabled={pending} onClick={add} className="px-3 py-1 rounded bg-brand-brown hover:bg-brand-brown-hover text-white text-xs disabled:opacity-60">
            + Add
          </button>
        </div>
      </td>
    </tr>
  );
}

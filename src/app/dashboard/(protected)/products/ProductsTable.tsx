'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FacetOption } from '@/lib/catalogAdmin';
import {
  saveProductRow,
  setProductPublished,
  bulkSetPublished,
  bulkSetSource,
  bulkSetFeatured,
  bulkDeleteProducts,
} from './actions';

export type ProductRow = {
  id: string;
  code: string | null;
  name: string;
  thumb: string | null;
  price: number;
  priceUnit: string;
  featuredRank: string;
  isPublished: boolean;
  isAvailable: boolean;
  hasImage: boolean;
  sourceCode: string;
  typeName: string;
  updated: string;
};

const cellInput =
  'px-2 py-1 bg-surface text-ink rounded border border-line-strong focus:outline-none focus:ring-1 focus:ring-accent';

export default function ProductsTable({
  rows,
  sources,
  canWrite,
}: {
  rows: ProductRow[];
  sources: FacetOption[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [bulkSource, setBulkSource] = useState('');
  const [bulkFeatured, setBulkFeatured] = useState('');

  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (rows.every((r) => next.has(r.id))) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ids = () => Array.from(selected);
  const runBulk = (fn: () => Promise<void>, keepSelection = false) =>
    start(async () => {
      await fn();
      if (!keepSelection) setSelected(new Set());
      router.refresh();
    });

  const deleteSelected = () => {
    if (!window.confirm(`Delete ${selected.size} product(s)? This cannot be undone.`)) return;
    runBulk(() => bulkDeleteProducts(ids()));
  };

  const colCount = canWrite ? 11 : 8;

  return (
    <div className="space-y-3">
      {canWrite && selected.size > 0 && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent-2/10 px-3 py-2 text-sm backdrop-blur">
          <span className="font-medium text-heading">{selected.size} selected</span>
          <button type="button" disabled={pending} onClick={() => runBulk(() => bulkSetPublished(ids(), true))} className="rounded border border-line px-2 py-1 text-ink hover:border-accent/60">
            Publish
          </button>
          <button type="button" disabled={pending} onClick={() => runBulk(() => bulkSetPublished(ids(), false))} className="rounded border border-line px-2 py-1 text-ink hover:border-accent/60">
            Unpublish
          </button>

          <span className="mx-1 h-5 w-px bg-line" />
          <select value={bulkSource} onChange={(e) => setBulkSource(e.target.value)} className={cellInput} aria-label="Bulk source">
            <option value="">Set source…</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="button" disabled={pending || !bulkSource} onClick={() => runBulk(() => bulkSetSource(ids(), bulkSource))} className="rounded border border-line px-2 py-1 text-ink hover:border-accent/60 disabled:opacity-40">
            Apply
          </button>

          <span className="mx-1 h-5 w-px bg-line" />
          <input value={bulkFeatured} onChange={(e) => setBulkFeatured(e.target.value)} placeholder="rank" type="number" min="0" className={`${cellInput} w-20`} aria-label="Bulk featured rank" />
          <button type="button" disabled={pending} onClick={() => runBulk(() => bulkSetFeatured(ids(), bulkFeatured === '' ? null : Number(bulkFeatured)))} className="rounded border border-line px-2 py-1 text-ink hover:border-accent/60">
            Set featured
          </button>

          <span className="mx-1 h-5 w-px bg-line" />
          <button type="button" disabled={pending} onClick={deleteSelected} className="rounded border border-red-500/50 px-2 py-1 text-red-300 hover:bg-red-500/10">
            Delete
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="ms-auto text-muted hover:text-ink">
            Clear
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-muted border-b border-line">
              {canWrite && (
                <th className="w-8 py-2 px-2">
                  <input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Select all on page" />
                </th>
              )}
              <th className="w-12 py-2 pe-3" />
              <th className="text-start py-2 pe-3">Code</th>
              <th className="text-start py-2 pe-3">Name (en)</th>
              <th className="text-start py-2 pe-3">Source</th>
              <th className="text-start py-2 pe-3">Type</th>
              <th className="text-start py-2 pe-3">Price</th>
              {canWrite && <th className="text-start py-2 pe-3">Unit</th>}
              {canWrite && <th className="text-start py-2 pe-3">Feat.</th>}
              <th className="text-start py-2 pe-3">Updated</th>
              <th className="text-end py-2">{canWrite ? 'Row' : ''}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row
                key={`${row.id}:${row.price}:${row.priceUnit}:${row.featuredRank}:${row.isPublished}:${row.sourceCode}`}
                row={row}
                canWrite={canWrite}
                selected={selected.has(row.id)}
                onToggle={() => toggleOne(row.id)}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="py-10 text-center text-muted">
                  No products match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  row,
  canWrite,
  selected,
  onToggle,
}: {
  row: ProductRow;
  canWrite: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [price, setPrice] = useState(row.price ? String(row.price) : '');
  const [unit, setUnit] = useState(row.priceUnit);
  const [featured, setFeatured] = useState(row.featuredRank);

  const dirty = canWrite && (price !== (row.price ? String(row.price) : '') || unit !== row.priceUnit || featured !== row.featuredRank);

  const save = () =>
    start(async () => {
      const fd = new FormData();
      fd.set('price', price || '0');
      fd.set('priceUnit', unit);
      fd.set('featuredRank', featured);
      await saveProductRow(row.id, fd);
      router.refresh();
    });

  const togglePublish = () =>
    start(async () => {
      await setProductPublished(row.id, !row.isPublished);
      router.refresh();
    });

  return (
    <tr className={`border-b border-line/50 hover:bg-surface/60 ${selected ? 'bg-accent-2/5' : ''}`}>
      {canWrite && (
        <td className="py-2 px-2">
          <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${row.code ?? row.name}`} />
        </td>
      )}
      <td className="py-2 pe-3">
        <div className="w-10 h-10 rounded bg-surface-2 overflow-hidden">
          {row.thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
          )}
        </div>
      </td>
      <td className="py-2 pe-3 whitespace-nowrap">{row.code ?? '—'}</td>
      <td className="py-2 pe-3">
        <button
          type="button"
          onClick={canWrite ? togglePublish : undefined}
          disabled={!canWrite || pending}
          title={row.isPublished ? 'Published — click to unpublish' : 'Hidden — click to publish'}
          className="inline-flex items-center gap-2 text-start"
        >
          <span className={`inline-block w-2 h-2 rounded-full ${row.isPublished ? 'bg-green-500' : 'bg-line-strong'}`} />
          <span className="truncate max-w-[16rem]">{row.name}</span>
        </button>
      </td>
      <td className="py-2 pe-3 text-muted whitespace-nowrap">{row.sourceCode}</td>
      <td className="py-2 pe-3 text-muted whitespace-nowrap">{row.typeName || '—'}</td>
      {canWrite ? (
        <>
          <td className="py-2 pe-3">
            <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" step="0.01" min="0" className={`${cellInput} w-24`} aria-label="Price" />
          </td>
          <td className="py-2 pe-3">
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="per m²…" className={`${cellInput} w-28`} aria-label="Price unit" />
          </td>
          <td className="py-2 pe-3">
            <input value={featured} onChange={(e) => setFeatured(e.target.value)} type="number" min="0" placeholder="—" className={`${cellInput} w-16`} aria-label="Featured rank" />
          </td>
        </>
      ) : (
        <td className="py-2 pe-3">{row.price || '—'}</td>
      )}
      <td className="py-2 pe-3 text-muted whitespace-nowrap">{row.updated}</td>
      <td className="py-2 text-end whitespace-nowrap">
        <div className="inline-flex items-center gap-3">
          {canWrite && dirty && (
            <button type="button" disabled={pending} onClick={save} className="px-3 py-1 rounded bg-brand-brown hover:bg-brand-brown-hover text-white text-xs disabled:opacity-60">
              Save
            </button>
          )}
          <Link href={`/dashboard/products/${row.id}/edit`} className="text-accent hover:underline">
            Edit
          </Link>
        </div>
      </td>
    </tr>
  );
}

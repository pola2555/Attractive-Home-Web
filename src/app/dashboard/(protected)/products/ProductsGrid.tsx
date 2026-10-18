'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ProductRow } from './ProductsTable';
import { REVIEW_BADGE } from './reviewUi';
import BulkBar from './BulkBar';

// Card grid for the products list. Cards are selectable (click to toggle) and
// carry the review-status colour; the bulk bar is shared with the table.
export default function ProductsGrid({
  rows,
  canWrite,
}: {
  rows: ProductRow[];
  canWrite: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-3">
      {canWrite && selected.size > 0 && (
        <BulkBar ids={Array.from(selected)} onDone={() => setSelected(new Set())} />
      )}

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
      >
        {rows.map((row) => {
          const isSel = selected.has(row.id);
          const badge = REVIEW_BADGE[row.reviewStatus];
          return (
            <div
              key={row.id}
              onClick={canWrite ? () => toggle(row.id) : undefined}
              className={`group relative bg-surface rounded-lg overflow-hidden border transition-colors ${
                isSel ? 'border-accent ring-2 ring-accent' : 'border-line hover:border-accent/60'
              } ${canWrite ? 'cursor-pointer' : ''}`}
            >
              <div className="relative aspect-square bg-surface-2">
                {row.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-muted text-xs">No image</div>
                )}
                {canWrite && (
                  <span
                    className={`absolute top-2 start-2 w-5 h-5 rounded-md border-2 border-white grid place-items-center text-[11px] text-white shadow ${
                      isSel ? 'bg-accent' : 'bg-black/25'
                    }`}
                    aria-hidden
                  >
                    {isSel ? '✓' : ''}
                  </span>
                )}
                <span
                  title={row.isPublished ? 'Published' : 'Unpublished'}
                  className={`absolute top-2 end-2 w-2.5 h-2.5 rounded-full ${row.isPublished ? 'bg-green-500' : 'bg-line-strong'}`}
                />
                {badge && (
                  <span
                    className={`absolute bottom-2 start-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="text-ink text-sm font-medium truncate" title={row.name}>
                  {row.name}
                </p>
                <p className="text-muted text-xs mt-0.5 truncate">{row.code ?? '—'}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-heading text-sm">
                    {row.price ? `${row.price} ${row.priceUnit}` : '—'}
                  </span>
                  <Link
                    href={`/dashboard/products/${row.id}/edit`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-accent text-xs hover:underline"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-muted py-10">No products match these filters.</p>}
      </div>
    </div>
  );
}

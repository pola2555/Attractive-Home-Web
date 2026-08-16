'use client';

import { useState } from 'react';
import Link from 'next/link';

// Collections can number in the hundreds, so this facet gets a client-side
// filter box + show-all/less. The links are real <Link>s (crawlable) — the
// island only filters/collapses what the server already rendered.
export type CollectionItem = { code: string; name: string; count: number; href: string; isActive: boolean };

const INITIAL = 12;

export default function CollectionFacet({
  items,
  showAllLabel,
  showLessLabel,
  filterPlaceholder,
}: {
  items: CollectionItem[];
  showAllLabel: string; // may contain {{count}}
  showLessLabel: string;
  filterPlaceholder: string;
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  const visible = expanded || q ? filtered : filtered.slice(0, INITIAL);

  return (
    <div className="mt-2 space-y-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={filterPlaceholder}
        className="w-full px-2 py-1 text-sm bg-surface text-ink rounded border border-line-strong focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <ul className="space-y-1 max-h-72 overflow-y-auto pe-2">
        {visible.map((v) => (
          <li key={v.code}>
            <Link
              href={v.href}
              className={`flex items-center gap-2 text-sm rounded px-2 py-1 transition-colors ${
                v.isActive ? 'bg-accent-2/15 text-heading font-semibold' : 'text-ink hover:bg-accent-2/10'
              }`}
            >
              <input
                type="checkbox"
                checked={v.isActive}
                readOnly
                tabIndex={-1}
                aria-hidden="true"
                className="pointer-events-none w-4 h-4 shrink-0 accent-accent"
              />
              <span className="truncate flex-1">{v.name}</span>
              <span className="text-muted shrink-0">{v.count}</span>
            </Link>
          </li>
        ))}
        {visible.length === 0 && <li className="text-muted text-sm px-2">—</li>}
      </ul>
      {!q && filtered.length > INITIAL && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-xs text-accent hover:underline"
        >
          {expanded ? showLessLabel : showAllLabel.replace('{{count}}', String(filtered.length))}
        </button>
      )}
    </div>
  );
}

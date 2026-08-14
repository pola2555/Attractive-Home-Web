'use client';

import { useRouter } from 'next/navigation';

// Compact dropdown widget for a facet (an admin-selectable alternative to the
// expanded link list). Each option carries the catalog URL for that value;
// choosing one navigates. "All" clears the facet.
export default function FacetDropdown({
  items,
  allLabel,
  allHref,
  value,
}: {
  items: { code: string; name: string; count: number; href: string }[];
  allLabel: string;
  allHref: string;
  value: string;
}) {
  const router = useRouter();
  return (
    <select
      value={value}
      onChange={(e) => router.push(e.target.value)}
      className="mt-2 w-full px-2 py-1.5 text-sm bg-surface text-ink rounded border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent"
    >
      <option value={allHref}>{allLabel}</option>
      {items.map((item) => (
        <option key={item.code} value={item.href}>
          {item.name} ({item.count})
        </option>
      ))}
    </select>
  );
}

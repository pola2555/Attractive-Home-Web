'use client';

import { useSyncExternalStore } from 'react';

// Shows a server timestamp in Dubai time (the business's timezone), with the
// viewer's own local time next to it. The server (and the DB) store UTC; the box
// itself runs in another region, so we never show "server-local" time — Dubai is
// the canonical display, and the browser adds the viewer's conversion.
const DUBAI = 'Asia/Dubai';

const subscribe = () => () => {};
const clientTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
};
const serverTz = () => '';

function fmt(iso: string, tz: string, time: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(time ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(d);
}

// Short offset tag for the viewer's conversion, e.g. "GMT+1".
function zoneTag(iso: string, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date(iso));
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

export default function DualTime({ iso, time = true }: { iso: string; time?: boolean }) {
  // Dubai time is deterministic (fixed tz) so it renders identically on the
  // server and the client. The viewer's local conversion comes from the browser
  // via useSyncExternalStore — hydration-safe, no setState-in-effect.
  const tz = useSyncExternalStore(subscribe, clientTz, serverTz);
  const local = tz && tz !== DUBAI ? fmt(iso, tz, time) : null;
  return (
    <span className="whitespace-nowrap">
      {fmt(iso, DUBAI, time)} <span className="text-muted">GST</span>
      {local && (
        <span className="text-muted">
          {' · '}
          {local} {zoneTag(iso, tz)} <span className="opacity-70">your time</span>
        </span>
      )}
    </span>
  );
}

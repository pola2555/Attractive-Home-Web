'use client';

import { track } from '@/lib/analytics/track';

// A plain outbound anchor that pushes a dataLayer event on click before the
// browser follows the link. Keeps server components server-side — only this
// thin wrapper is a client component.
export default function TrackedLink({
  event,
  params,
  children,
  onClick,
  ...anchor
}: React.ComponentProps<'a'> & { event: string; params?: Record<string, unknown> }) {
  return (
    <a
      {...anchor}
      onClick={(e) => {
        track(event, params);
        onClick?.(e);
      }}
    >
      {children}
    </a>
  );
}

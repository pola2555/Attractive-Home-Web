import type { ReactNode } from 'react';

// Shared look for the home marketing bands — the old site's navy/cream/gold
// palette, applied directly (these sections intentionally sit outside the app
// theme). RTL is handled by <html dir> + logical Tailwind utilities.
const TONES = {
  cream: { bg: '#FAF5EC', heading: '#0D1822', body: '#3B3B3B' },
  creamAlt: { bg: '#F2ECE1', heading: '#0D1822', body: '#3B3B3B' },
  navy: { bg: '#111E29', heading: '#FFFFFF', body: '#F3E3CE' },
  navyDeep: { bg: '#0D1822', heading: '#FFFFFF', body: '#F3E3CE' },
} as const;

export type Tone = keyof typeof TONES;
export const GOLD = '#C08B5C';

export function Section({ tone: t, id, children }: { tone: Tone; id?: string; children: ReactNode }) {
  const c = TONES[t];
  // The cream bands are "light" for the navbar: as the transparent bar scrolls
  // over them, useNavSurface blends its colours dark so they stay readable.
  const light = t === 'cream' || t === 'creamAlt';
  return (
    <section
      id={id}
      data-nav-surface={light ? 'light' : undefined}
      style={{ backgroundColor: c.bg, color: c.body }}
      className="px-6 sm:px-10 lg:px-16 py-20 sm:py-24"
    >
      <div className="max-w-6xl mx-auto">{children}</div>
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold tracking-[0.2em] uppercase mb-3" style={{ color: GOLD }}>
      {children}
    </p>
  );
}

export function Heading({ children, tone: t }: { children: ReactNode; tone: Tone }) {
  return (
    <h2 className="text-3xl sm:text-4xl font-bold leading-tight" style={{ color: TONES[t].heading }}>
      {children}
    </h2>
  );
}

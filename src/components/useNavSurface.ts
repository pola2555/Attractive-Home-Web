import { useEffect, type RefObject } from 'react';

// Keeps the transparent navbar readable over the home page's alternating
// light/dark bands. The bar's cream wordmark and links nearly vanish over the
// cream sections, so this measures how much of the bar currently OVERLAPS a
// light band and blends its colour tokens toward dark by that fraction.
//
// Because the measure is the overlap — not "which section is under the middle" —
// the change is gradual by construction: as a cream band's top edge rises into
// the bar, the fraction climbs 0 → 1 across the bar's own height, easing the
// colours over rather than snapping. Mark a light band with
// data-nav-surface="light"; anything unmarked counts as dark, so every other
// page keeps its current appearance untouched.

// The theme tokens as space-separated RGB (what rgb(var(--ink)) and Tailwind's
// opacity modifiers expect). DARK = the :root defaults; LIGHT = the values that
// read on cream — the accent-2 (language-pill border) blends toward caramel
// because the light-theme chip colour is too pale over cream.
const DARK: Record<string, [number, number, number]> = {
  '--ink': [245, 230, 211],
  '--heading': [230, 201, 168],
  '--accent': [196, 134, 74],
  '--accent-2': [230, 201, 168],
};
const LIGHT: Record<string, [number, number, number]> = {
  '--ink': [26, 38, 46],
  '--heading': [122, 74, 30],
  '--accent': [176, 112, 46],
  '--accent-2': [176, 112, 46],
};

const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

// Below this width the bar holds only the logo and the menu button; tinting
// those is more distracting than helpful, so the text stays dark-theme and only
// the logo follows the section. Matches the `md` breakpoint where the desktop
// link row appears (Navbar uses `hidden md:flex`).
const DESKTOP = '(min-width: 768px)';

// `routeKey` re-runs the measurement on navigation — without it, moving to a
// page with no light bands would leave the bar dark until the next scroll, and
// landing already at the top fires none.
export default function useNavSurface(navRef: RefObject<HTMLElement | null>, routeKey: string): void {
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const mq = window.matchMedia(DESKTOP);
    let frame = 0;
    let last = -1;
    let lastDesktop: boolean | null = null;

    const apply = () => {
      frame = 0;
      const bar = nav.getBoundingClientRect();
      const height = bar.height;
      if (height <= 0) return;

      // How many pixels of the bar's band are covered by light sections, summed
      // so two light bands meeting under the bar still read as fully covered.
      let covered = 0;
      for (const el of document.querySelectorAll('[data-nav-surface="light"]')) {
        const r = el.getBoundingClientRect();
        covered += Math.max(0, Math.min(r.bottom, bar.bottom) - Math.max(r.top, bar.top));
      }

      const t = Math.min(1, Math.max(0, covered / height));
      const desktop = mq.matches;
      // Skip repaints through the middle of a long band where the value does not
      // move; crossing the breakpoint must force a pass even when t is unchanged.
      if (Math.abs(t - last) < 0.01 && desktop === lastDesktop) return;
      last = t;
      lastDesktop = desktop;

      const textT = desktop ? t : 0;
      for (const key of Object.keys(DARK)) {
        const [dr, dg, db] = DARK[key];
        const [lr, lg, lb] = LIGHT[key];
        nav.style.setProperty(key, `${mix(dr, lr, textT)} ${mix(dg, lg, textT)} ${mix(db, lb, textT)}`);
      }
      // Drives the logo filter in globals.css.
      nav.style.setProperty('--nav-light', String(t));
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    mq.addEventListener('change', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      mq.removeEventListener('change', schedule);
    };
  }, [navRef, routeKey]);
}

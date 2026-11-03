// Lightweight in-process rate limiter — a sliding-window counter keyed by an
// arbitrary string, held in a module-level Map that lives for the life of the
// server process (the box runs a single Node instance). No dependency, no
// schema. It resets on restart and is NOT shared across instances; if the app
// is ever scaled horizontally, back this with Redis or a Postgres table. It is
// a throttle to blunt brute-force / enumeration / email-bombing, not a hard
// quota.

type Scope = { key: string; limit: number; windowMs: number };
export type RateResult = { ok: boolean; retryAfterMs: number };

const store = new Map<string, number[]>();
const MAX_WINDOW_MS = 60 * 60_000; // longest window we use (1h) — sweep horizon
const SWEEP_EVERY_MS = 5 * 60_000;
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < SWEEP_EVERY_MS && store.size < 20_000) return;
  lastSweep = now;
  for (const [key, hits] of store) {
    if (!hits.length || hits[hits.length - 1] < now - MAX_WINDOW_MS) store.delete(key);
  }
}

// Check every scope; only record a hit against all of them if they ALL pass, so
// a denied attempt doesn't consume budget. Returns the longest retry-after when
// denied.
export function rateLimit(scopes: Scope[]): RateResult {
  const now = Date.now();
  sweep(now);

  let denied: RateResult | null = null;
  const pruned: number[][] = [];
  for (const s of scopes) {
    const hits = (store.get(s.key) ?? []).filter((t) => t > now - s.windowMs);
    store.set(s.key, hits);
    pruned.push(hits);
    if (hits.length >= s.limit) {
      const retryAfterMs = Math.max(0, hits[0] + s.windowMs - now);
      if (!denied || retryAfterMs > denied.retryAfterMs) denied = { ok: false, retryAfterMs };
    }
  }
  if (denied) return denied;

  for (const hits of pruned) hits.push(now);
  return { ok: true, retryAfterMs: 0 };
}

// Client IP from proxy headers. Returns null when there is no forwarding header
// (the box runs direct on :3000 today — a reverse proxy in Phase 5 will set
// x-forwarded-for). Callers skip IP-scoped limits when this is null rather than
// bucket every visitor under one shared key. NOTE: x-forwarded-for is only
// trustworthy behind a proxy that overwrites it; until then IP scoping is
// best-effort and the identifier-scoped limits are the real protection.
export async function clientIp(): Promise<string | null> {
  // Dynamic import keeps this module free of a static next/headers dependency so
  // the pure limiter above stays unit-testable in a plain Node context.
  const { headers } = await import('next/headers');
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  return h.get('x-real-ip')?.trim() || null;
}

// Friendly, enumeration-safe "slow down" message with a rough wait hint.
export function tooManyMessage(retryAfterMs: number): string {
  const mins = Math.ceil(retryAfterMs / 60_000);
  if (mins <= 1) return 'Too many attempts. Please wait a minute and try again.';
  return `Too many attempts. Please wait about ${mins} minutes and try again.`;
}

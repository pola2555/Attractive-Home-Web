import 'server-only';

// Shared fetch wrapper for real provider adapters.
//
// The one rule this file exists to enforce: A PROVIDER MUST NEVER THROW INTO A
// PAGE RENDER. A freight API being slow, rate-limited or down is an ordinary
// Tuesday; it must degrade the quote to "rate card" or "needs a manual line",
// never blank the dashboard with an unhandled rejection in a server component.
//
// Every helper here returns null on failure. Callers translate null into a
// fallback, which is why `FreightProvider.quote` is typed `Promise<T | null>`
// rather than `Promise<T>`.

export type HttpOptions = {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  /** Milliseconds before the first retry; doubles each attempt. */
  backoffMs?: number;
};

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET/POST JSON with a timeout, bounded retries and no throwing. Returns null
 * when the call cannot be completed — the caller falls back.
 */
export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  options: HttpOptions = {},
): Promise<T | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  let backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: { accept: 'application/json', ...options.headers, ...init.headers },
        // Rates are volatile and quote-specific; a cached freight rate is worse
        // than a slow one.
        cache: 'no-store',
      });

      // 4xx is our mistake and will not fix itself — retrying wastes the
      // request budget and delays the fallback.
      if (response.status >= 400 && response.status < 500) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      return (await response.json()) as T;
    } catch {
      if (attempt === retries) return null;
      await sleep(backoff);
      backoff *= 2;
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

/**
 * Read a provider credential from the environment. Returns null when unset, so
 * a half-configured provider disables itself instead of sending empty auth
 * headers and getting mysterious 401s.
 */
export function credential(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

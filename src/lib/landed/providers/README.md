# Adding a real landed-cost API

Freight, customs and port storage each price from a rate table today
(`freight_rates`, `hs_codes`, `port_storage_rates`). When a real service is
chosen, it slots in here.

**Adding one is three small steps. It is never a migration, and it never
changes `compute.ts`.**

---

## 1. Write the adapter

One file, implementing the matching interface from [`../types.ts`](../types.ts)
— `FreightProvider`, `CustomsProvider` or `StorageProvider`.

```ts
import 'server-only';
import { credential, fetchJson } from './_http';
import type { CostQuote, FreightProvider, FreightQuoteInput } from '../types';

export const acmeFreight: FreightProvider = {
  code: 'acme',
  async quote(input: FreightQuoteInput): Promise<CostQuote | null> {
    const key = credential('ACME_API_KEY');
    if (!key) return null; // not configured -> fall back, don't send empty auth

    const data = await fetchJson<AcmeResponse>('https://api.acme.example/rates', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      body: JSON.stringify({ /* map input -> their shape */ }),
    });
    if (!data) return null; // timed out, 4xx, or unparseable -> fall back

    return {
      expected: data.total,
      low: data.min ?? null,
      high: data.max ?? null,
      currency: data.currency,
      provider: 'acme',
      fetchedAt: new Date().toISOString(),
      breakdown: { quoteId: data.id, surcharges: data.surcharges },
    };
  },
};
```

### The three rules

1. **Return `null`, never throw.** A provider that throws blanks a dashboard
   page. Missing credentials, a timeout, a 4xx, an unexpected payload — all of
   them are `null`, and the caller falls back to the rate card. Use
   [`_http.ts`](./_http.ts), which already handles timeout, bounded retry and
   swallowing.
2. **Fill in `breakdown`.** It is persisted verbatim into
   `cost_components.basis` and is the only record of how a number was reached
   once the API's own quote expires. Include their quote id.
3. **Never compute duty or VAT yourself.** `compute.ts` owns the CIF → duty →
   VAT chain and the scenario logic. A provider reports *charges*; the
   calculator decides what they mean.

## 2. Register it

In [`index.ts`](./index.ts):

```ts
const FREIGHT: Record<string, FreightProvider> = {
  rate_card: rateCardFreight,
  acme: acmeFreight,
};
```

## 3. Select it

Set `settings['landed.freight_provider']` to `'acme'` in the dashboard settings
screen. An unrecognised value falls back to `rate_card`, so a typo degrades to
offline-but-working rather than breaking every quote.

---

## What the calculator guarantees

Worth knowing before mapping a provider's response:

- **`low` / `high` are optional.** When null, the quote's `contingency_percent`
  supplies the band instead. Do not invent a spread to fill the fields — a real
  band from the carrier is worth something, a guessed one is not.
- **Scenarios are evaluated end to end.** `compute.ts` runs the whole chain once
  per scenario and recomputes every percentage from that scenario's own base. It
  never sums per-component minimums, because that describes a shipment that
  cannot physically occur.
- **Modes are compared, never blended.** Air, LCL and FCL are priced side by
  side. A provider only ever answers for the mode it was asked about.
- **Chargeable quantity is derived.** [`../chargeable.ts`](../chargeable.ts)
  computes revenue tons, chargeable kilos or containers from the shipment. If
  the provider wants its own figure, return it in `breakdown` for comparison —
  do not expect the calculator to read it.
- **Currency is whatever the provider quotes in.** Conversion to the quote
  currency happens once, in `compute.ts`, against the FX rates snapshotted on
  the quote.

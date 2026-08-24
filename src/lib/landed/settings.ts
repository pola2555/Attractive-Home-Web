import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import { prisma } from '../prisma';

// Landed-cost settings, read the same way src/lib/content.ts reads contact
// settings: `schema.catch(default).parse(...)`. A bad edit in the settings
// screen degrades to the default instead of throwing inside a quote page —
// quoting must never break because someone typed a letter into a rate field.

const fxSchema = z.record(z.string(), z.number().positive());
const percentSchema = z.number().min(0).max(100);

export type LandedSettings = {
  fxRates: Record<string, number>;
  vatRecoverable: boolean;
  insurancePercent: number;
  contingencyPercent: number;
  defaultHsCode: string;
  freightProvider: string;
  customsProvider: string;
  storageProvider: string;
};

export const LANDED_SETTINGS_KEYS = [
  'landed.fx_rates',
  'landed.vat_recoverable',
  'landed.insurance_percent',
  'landed.contingency_percent',
  'landed.default_hs_code',
  'landed.freight_provider',
  'landed.customs_provider',
  'landed.storage_provider',
] as const;

// AED is pegged to USD at 3.6725. Present as an identity so a component already
// in the quote currency always resolves.
const DEFAULT_FX = { USD: 3.6725, CNY: 0.5163, EUR: 4.0, AED: 1 };

export const getLandedSettings = cache(async (): Promise<LandedSettings> => {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [...LANDED_SETTINGS_KEYS] } },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const str = (key: string, fallback: string) =>
    z
      .string()
      .catch(fallback)
      .parse(byKey.get(key) ?? fallback);

  const fxRates = fxSchema.catch(DEFAULT_FX).parse(byKey.get('landed.fx_rates') ?? DEFAULT_FX);

  return {
    // AED must always be present, or a component already in the quote currency
    // would report a missing rate.
    fxRates: { AED: 1, ...fxRates },
    vatRecoverable: z
      .boolean()
      .catch(true)
      .parse(byKey.get('landed.vat_recoverable') ?? true),
    insurancePercent: percentSchema.catch(0.5).parse(byKey.get('landed.insurance_percent') ?? 0.5),
    contingencyPercent: percentSchema
      .catch(7.5)
      .parse(byKey.get('landed.contingency_percent') ?? 7.5),
    defaultHsCode: str('landed.default_hs_code', ''),
    freightProvider: str('landed.freight_provider', 'rate_card'),
    customsProvider: str('landed.customs_provider', 'rate_card'),
    storageProvider: str('landed.storage_provider', 'rate_card'),
  };
});

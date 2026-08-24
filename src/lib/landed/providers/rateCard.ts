import 'server-only';
import { prisma } from '../../prisma';
import { chargeableQuantity } from '../chargeable';
import type {
  CostQuote,
  CustomsProvider,
  CustomsQuote,
  CustomsQuoteInput,
  CustomsQuoteLine,
  FreightProvider,
  FreightQuoteInput,
  StorageProvider,
  StorageQuoteInput,
} from '../types';

// The default providers: the rate tables seeded in prisma/seed/landed.ts.
//
// They implement exactly the interfaces a real API adapter will implement, so
// swapping one in is a new file plus a settings value — never a migration and
// never a change to compute.ts. Returning `null` means "cannot answer", and the
// caller falls back to a manual line rather than pricing a shipment at zero.

const now = () => new Date().toISOString();

function num(value: { toNumber(): number } | null | undefined): number | null {
  return value === null || value === undefined ? null : value.toNumber();
}

export const rateCardFreight: FreightProvider = {
  code: 'rate_card',
  async quote(input: FreightQuoteInput): Promise<CostQuote | null> {
    const rate = await prisma.freightRate.findFirst({
      where: {
        mode: input.mode,
        originPort: input.originPort,
        destinationPort: input.destinationPort,
        // FCL rates are per container type; LCL and air are not.
        ...(input.mode === 'sea_fcl' ? { containerType: input.containerType ?? undefined } : {}),
        isActive: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!rate) return null;

    const chargeable = chargeableQuantity(input.mode, {
      grossWeightKg: input.grossWeightKg,
      volumeCbm: input.volumeCbm,
      containerCount: input.containerCount,
      volumetricDivisor: rate.volumetricDivisor,
      packagingFactor: num(rate.packagingFactor),
    });

    const minCharge = num(rate.minCharge);
    const apply = (unitRate: number | null): number | null => {
      if (unitRate === null) return null;
      const raw = unitRate * chargeable.quantity;
      return minCharge !== null ? Math.max(raw, minCharge) : raw;
    };

    const expected = apply(rate.rate.toNumber());
    if (expected === null) return null;

    return {
      expected,
      low: apply(num(rate.rateLow)),
      high: apply(num(rate.rateHigh)),
      currency: rate.currency,
      provider: 'rate_card',
      fetchedAt: now(),
      // The audit trail for this number, including the chargeable quantity that
      // is deliberately not stored as a column anywhere.
      breakdown: {
        rateId: rate.id,
        unitRate: rate.rate.toNumber(),
        unit: rate.unit,
        chargeableQuantity: chargeable.quantity,
        chargeableUnit: chargeable.unit,
        minChargeApplied:
          minCharge !== null && rate.rate.toNumber() * chargeable.quantity < minCharge,
        transitDays: rate.transitDays,
        ...chargeable.detail,
      },
    };
  },
};

export const rateCardCustoms: CustomsProvider = {
  code: 'rate_card',
  async quote(input: CustomsQuoteInput): Promise<CustomsQuote | null> {
    const codes = input.lines.map((line) => line.hsCode).filter((c): c is string => !!c);
    const rows = codes.length
      ? await prisma.hsCode.findMany({ where: { code: { in: codes } } })
      : [];
    const byCode = new Map(rows.map((row) => [row.code, row]));

    const lines: CustomsQuoteLine[] = input.lines.map((line) => {
      const row = line.hsCode ? byCode.get(line.hsCode) : undefined;
      // GCC common external tariff falls back to 5%, but the caller surfaces a
      // "confirm before sending" issue when no HS code was matched — a guessed
      // duty rate must never look like a confirmed one.
      const dutyPercent = row ? row.dutyPercent.toNumber() : 5;
      const vatPercent = row ? row.vatPercent.toNumber() : 5;
      const duty = (line.cifValue * dutyPercent) / 100;
      // VAT sits on CIF plus duty.
      const vat = ((line.cifValue + duty) * vatPercent) / 100;
      return { hsCode: line.hsCode, cifValue: line.cifValue, dutyPercent, vatPercent, duty, vat };
    });

    return {
      lines,
      dutyTotal: lines.reduce((sum, line) => sum + line.duty, 0),
      vatTotal: lines.reduce((sum, line) => sum + line.vat, 0),
      currency: input.currency,
      provider: 'rate_card',
      fetchedAt: now(),
    };
  },
};

export const rateCardStorage: StorageProvider = {
  code: 'rate_card',
  async quote(input: StorageQuoteInput): Promise<CostQuote | null> {
    if (input.expectedDays <= 0) return null; // nothing accrued, so no line

    const rate = await prisma.portStorageRate.findFirst({
      where: {
        port: input.port,
        containerType: input.containerType ?? null,
        isActive: true,
      },
    });
    if (!rate) return null;

    const chargeableDays = Math.max(0, input.expectedDays - rate.freeDays);
    const units = Math.max(1, input.containerCount ?? 1);
    const expected = chargeableDays * rate.perDayRate.toNumber() * units;

    return {
      expected,
      // Storage is the least predictable component: it is zero when everything
      // goes right and grows fast when it does not. A wide, honest band beats a
      // precise-looking single number.
      low: 0,
      high: expected * 2,
      currency: rate.currency,
      provider: 'rate_card',
      fetchedAt: now(),
      breakdown: {
        rateId: rate.id,
        expectedDays: input.expectedDays,
        freeDays: rate.freeDays,
        chargeableDays,
        perDayRate: rate.perDayRate.toNumber(),
        units,
      },
    };
  },
};

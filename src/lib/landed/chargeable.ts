import type { FreightMode } from './types';

// Chargeable quantity — what the carrier actually bills for.
//
// This is a DERIVED value and is deliberately not a column on `shipments`.
// Storing it invites drift: edit the shipment volume and a stale number keeps
// pricing. It is also not one quantity — the three modes bill in three
// different units, so a single `chargeable_weight_kg` scalar cannot serve them:
//
//   air       chargeable KG   = max(gross, volumetric), rounded UP to 0.5 kg
//   sea LCL   revenue ton W/M = max(CBM, tonnes), minimum 1
//   sea FCL   containers      — no chargeable weight exists at all
//
// It is persisted only inside the freight component's `basis` JSON, which is
// already the record of how that charge was reached.

export type ChargeableQuantity = {
  unit: 'kg' | 'wm' | 'container';
  quantity: number;
  detail: Record<string, number | string>;
};

export type ChargeableInput = {
  grossWeightKg: number;
  volumeCbm: number;
  containerCount?: number | null;
  /**
   * cm3 per kg. IATA general cargo is 6000; express carriers use 5000. It is a
   * per-carrier contract parameter, which is why it lives on the rate row and
   * not in this file as a constant.
   */
  volumetricDivisor?: number | null;
  /**
   * Crating, pallets and packaging. The configurator derives a door's weight
   * from density x volume — the bare product. Carriers bill the packed item,
   * typically 8-15% more, in BOTH weight and volume.
   */
  packagingFactor?: number | null;
};

export const DEFAULT_VOLUMETRIC_DIVISOR = 6000;
export const LCL_MINIMUM_WM = 1;

/** Air freight bills in half-kilo steps, rounded up. */
export function roundUpToHalfKg(value: number): number {
  return Math.ceil(value * 2) / 2;
}

export function chargeableQuantity(mode: FreightMode, input: ChargeableInput): ChargeableQuantity {
  const factor = input.packagingFactor && input.packagingFactor > 0 ? input.packagingFactor : 1;
  const grossKg = Math.max(0, input.grossWeightKg) * factor;
  const cbm = Math.max(0, input.volumeCbm) * factor;

  if (mode === 'sea_fcl') {
    const containers = Math.max(1, Math.ceil(input.containerCount ?? 1));
    return {
      unit: 'container',
      quantity: containers,
      detail: { containers, packagingFactor: factor },
    };
  }

  if (mode === 'air') {
    const divisor =
      input.volumetricDivisor && input.volumetricDivisor > 0
        ? input.volumetricDivisor
        : DEFAULT_VOLUMETRIC_DIVISOR;
    // 1 m3 = 1,000,000 cm3.
    const volumetricKg = (cbm * 1_000_000) / divisor;
    const chargeable = roundUpToHalfKg(Math.max(grossKg, volumetricKg));
    return {
      unit: 'kg',
      quantity: chargeable,
      detail: {
        grossKg: round3(grossKg),
        volumetricKg: round3(volumetricKg),
        divisor,
        packagingFactor: factor,
        billedOn: grossKg >= volumetricKg ? 'gross weight' : 'volumetric weight',
      },
    };
  }

  // sea_lcl — revenue ton. Note the comparison is CBM against TONNES, not kg:
  // 1 W/M is 1 cubic metre or 1000 kg, whichever is greater.
  const tonnes = grossKg / 1000;
  const revenueTons = Math.max(cbm, tonnes, LCL_MINIMUM_WM);
  return {
    unit: 'wm',
    quantity: round3(revenueTons),
    detail: {
      cbm: round3(cbm),
      tonnes: round3(tonnes),
      packagingFactor: factor,
      billedOn: cbm >= tonnes ? 'volume' : 'weight',
      minimumApplied: Math.max(cbm, tonnes) < LCL_MINIMUM_WM ? 'yes' : 'no',
    },
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

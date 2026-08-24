import 'server-only';
import { getLandedSettings } from '../settings';
import { rateCardCustoms, rateCardFreight, rateCardStorage } from './rateCard';
import type { CustomsProvider, FreightProvider, StorageProvider } from '../types';

// The registry. `settings['landed.*_provider']` names which adapter to use;
// anything unrecognised falls back to the rate card, so a typo in the settings
// screen degrades to working-but-offline rather than breaking every quote.
//
// TO ADD A REAL API — see ./README.md. In short: one new file implementing the
// interface from ../types.ts, one entry in the map below, one settings value.
// No migration, no change to compute.ts.

const FREIGHT: Record<string, FreightProvider> = { rate_card: rateCardFreight };
const CUSTOMS: Record<string, CustomsProvider> = { rate_card: rateCardCustoms };
const STORAGE: Record<string, StorageProvider> = { rate_card: rateCardStorage };

export async function freightProvider(): Promise<FreightProvider> {
  const { freightProvider: code } = await getLandedSettings();
  return (Object.hasOwn(FREIGHT, code) ? FREIGHT[code] : undefined) ?? rateCardFreight;
}

export async function customsProvider(): Promise<CustomsProvider> {
  const { customsProvider: code } = await getLandedSettings();
  return (Object.hasOwn(CUSTOMS, code) ? CUSTOMS[code] : undefined) ?? rateCardCustoms;
}

export async function storageProvider(): Promise<StorageProvider> {
  const { storageProvider: code } = await getLandedSettings();
  return (Object.hasOwn(STORAGE, code) ? STORAGE[code] : undefined) ?? rateCardStorage;
}

export const AVAILABLE_PROVIDERS = {
  freight: Object.keys(FREIGHT),
  customs: Object.keys(CUSTOMS),
  storage: Object.keys(STORAGE),
};

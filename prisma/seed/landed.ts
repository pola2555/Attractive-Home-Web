import { uuidv7 } from 'uuidv7';
import type { PrismaClient } from '@prisma/client';

// Starter rate cards for the China -> UAE lane. These are REALISTIC ORDERS OF
// MAGNITUDE, not quoted rates — they exist so landed cost is computable on day
// one and so the rate-card screens have something to show. The team replaces
// them with real figures from their forwarder; a future API adapter overwrites
// them at runtime without touching this file.
//
// Idempotent like every other seed (docs/DATABASE.md §9): `update: {}` keyed by
// a natural key, so re-running never clobbers a rate the team corrected.

// GCC common external tariff: 5% on most goods. The categories that differ are
// the whole reason this is a table rather than a constant.
const HS_CODES = [
  {
    code: '4418.20',
    description: 'Doors and their frames and thresholds, of wood',
    dutyPercent: 5,
  },
  {
    code: '4418.10',
    description: 'Windows, french-windows and their frames, of wood',
    dutyPercent: 5,
  },
  {
    code: '4411.14',
    description: 'Fibreboard (MDF) of a thickness exceeding 9 mm',
    dutyPercent: 5,
  },
  { code: '7610.10', description: 'Doors, windows and their frames, of aluminium', dutyPercent: 5 },
  { code: '8302.10', description: 'Hinges of base metal', dutyPercent: 5 },
  { code: '8301.40', description: 'Locks of base metal, other', dutyPercent: 5 },
  {
    code: '6907.21',
    description: 'Ceramic flags and paving tiles, water absorption <= 0.5%',
    dutyPercent: 5,
  },
  { code: '6802.23', description: 'Granite, worked monumental or building stone', dutyPercent: 5 },
  {
    code: '3208.20',
    description: 'Paints and varnishes based on acrylic polymers',
    dutyPercent: 5,
  },
  { code: '9403.60', description: 'Other wooden furniture', dutyPercent: 5 },
];

// Shanghai -> Jebel Ali. Sea LCL bills a revenue ton (W/M); FCL bills the box;
// air bills chargeable kg. The three are NOT interchangeable units, which is
// why `unit` is stored per row rather than assumed per mode in code.
const FREIGHT_RATES = [
  {
    mode: 'sea_lcl',
    originPort: 'CNSHA',
    destinationPort: 'AEJEA',
    containerType: null,
    unit: 'wm',
    rate: 95,
    rateLow: 75,
    rateHigh: 140,
    minCharge: 120, // 1 W/M minimum is standard on LCL
    currency: 'USD',
    transitDays: 22,
    volumetricDivisor: null,
    packagingFactor: 1.1,
  },
  {
    mode: 'sea_fcl',
    originPort: 'CNSHA',
    destinationPort: 'AEJEA',
    containerType: '20GP',
    unit: 'container',
    rate: 1250,
    rateLow: 950,
    rateHigh: 2100,
    minCharge: null,
    currency: 'USD',
    transitDays: 20,
    volumetricDivisor: null,
    packagingFactor: 1.08,
  },
  {
    mode: 'sea_fcl',
    originPort: 'CNSHA',
    destinationPort: 'AEJEA',
    containerType: '40HQ',
    unit: 'container',
    rate: 2150,
    rateLow: 1600,
    rateHigh: 3600,
    minCharge: null,
    currency: 'USD',
    transitDays: 20,
    volumetricDivisor: null,
    packagingFactor: 1.08,
  },
  {
    mode: 'air',
    originPort: 'CNSHA',
    destinationPort: 'AEDXB',
    containerType: null,
    unit: 'kg',
    rate: 4.6,
    rateLow: 3.4,
    rateHigh: 7.2,
    minCharge: 180,
    currency: 'USD',
    transitDays: 5,
    // IATA general cargo. Express carriers use 5000 — it is a contract
    // parameter per carrier, never a constant in code.
    volumetricDivisor: 6000,
    packagingFactor: 1.15,
  },
];

// Storage only accrues when something goes wrong, so the default expected days
// on a shipment is 0 and these rates usually contribute nothing.
const PORT_STORAGE_RATES = [
  { port: 'AEJEA', containerType: null, freeDays: 5, perDayRate: 45, currency: 'AED' },
  { port: 'AEJEA', containerType: '20GP', freeDays: 5, perDayRate: 120, currency: 'AED' },
  { port: 'AEJEA', containerType: '40HQ', freeDays: 5, perDayRate: 240, currency: 'AED' },
  { port: 'AEDXB', containerType: null, freeDays: 2, perDayRate: 65, currency: 'AED' },
];

export async function seedLanded(prisma: PrismaClient): Promise<void> {
  for (const hs of HS_CODES) {
    await prisma.hsCode.upsert({
      where: { code: hs.code },
      update: {},
      create: { id: uuidv7(), vatPercent: 5, ...hs },
    });
  }

  // freight_rates has no natural unique key (a lane can have several validity
  // windows), so idempotency is a find-then-create on the identifying columns.
  let freightCreated = 0;
  for (const rate of FREIGHT_RATES) {
    const existing = await prisma.freightRate.findFirst({
      where: {
        mode: rate.mode,
        originPort: rate.originPort,
        destinationPort: rate.destinationPort,
        containerType: rate.containerType,
      },
    });
    if (existing) continue;
    await prisma.freightRate.create({ data: { id: uuidv7(), ...rate } });
    freightCreated += 1;
  }

  // Not an upsert on the compound unique: `container_type` is nullable, and in
  // Postgres NULL <> NULL, so the UNIQUE index does not actually stop a second
  // (AEJEA, NULL) row. find-then-create does.
  let storageCreated = 0;
  for (const storage of PORT_STORAGE_RATES) {
    const existing = await prisma.portStorageRate.findFirst({
      where: { port: storage.port, containerType: storage.containerType },
    });
    if (existing) continue;
    await prisma.portStorageRate.create({ data: { id: uuidv7(), ...storage } });
    storageCreated += 1;
  }

  console.log(
    `  landed: ${HS_CODES.length} HS codes, ${freightCreated} new freight rates, ${storageCreated} new storage rates ensured`,
  );
}

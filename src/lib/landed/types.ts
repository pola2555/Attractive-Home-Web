// Contracts for the China -> UAE landed-cost chain.
//
// THIS FILE IS THE API SPACE. Freight, customs and port storage will each get a
// real external service eventually; none has been chosen. Rather than inventing
// three adapters against imagined APIs, the types below define the input a
// provider receives and the shape it must return. Adding a real integration is
// one new file in `providers/` implementing the matching interface and one
// settings value naming it — never a migration, and never a change to the
// calculator.
//
// A provider returns `null` when it cannot answer (no lane, timeout, bad
// credentials). The caller falls back to the rate card. Providers must never
// throw into a page render; `providers/_http.ts` enforces that.

export const FREIGHT_MODES = ['sea_lcl', 'sea_fcl', 'air'] as const;
export type FreightMode = (typeof FREIGHT_MODES)[number];

export const CONTAINER_TYPES = ['20GP', '40GP', '40HQ'] as const;
export type ContainerType = (typeof CONTAINER_TYPES)[number];

// Three scenarios evaluated end-to-end, never three columns summed. See
// compute.ts for why summing per-component minimums is meaningless.
export const SCENARIOS = ['low', 'expected', 'high'] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const COST_KINDS = [
  'goods',
  'freight',
  'insurance',
  'customs_duty',
  'vat',
  'port_storage',
  'handling',
  'inland',
  'documentation',
  'thc',
  'other',
] as const;
export type CostKind = (typeof COST_KINDS)[number];

// Duty is charged on CIF: cost of goods, insurance and freight. Post-import
// charges must be excluded or they inflate both duty and VAT. This is the
// default for a new component; the column on cost_components is what actually
// governs, so a correction survives.
export const CIF_KINDS: readonly CostKind[] = ['goods', 'freight', 'insurance'];

export type CostQuote = {
  expected: number;
  low: number | null;
  high: number | null;
  currency: string;
  /** Which adapter produced this — 'rate_card', or a real provider code. */
  provider: string;
  fetchedAt: string;
  /** How the number was reached. Persisted verbatim into `basis`. */
  breakdown?: Record<string, unknown>;
};

export type FreightQuoteInput = {
  mode: FreightMode;
  originPort: string;
  destinationPort: string;
  containerType?: string | null;
  containerCount?: number | null;
  volumeCbm: number;
  grossWeightKg: number;
  goodsValue: number;
  currency: string;
};

export type CustomsQuoteInput = {
  destinationPort: string;
  /** One entry per HS code present on the shipment. */
  lines: { hsCode: string | null; cifValue: number }[];
  currency: string;
};

export type CustomsQuoteLine = {
  hsCode: string | null;
  cifValue: number;
  dutyPercent: number;
  vatPercent: number;
  duty: number;
  vat: number;
};

export type CustomsQuote = {
  lines: CustomsQuoteLine[];
  dutyTotal: number;
  vatTotal: number;
  currency: string;
  provider: string;
  fetchedAt: string;
};

export type StorageQuoteInput = {
  port: string;
  containerType?: string | null;
  containerCount?: number | null;
  expectedDays: number;
};

export interface FreightProvider {
  readonly code: string;
  quote(input: FreightQuoteInput): Promise<CostQuote | null>;
}

export interface CustomsProvider {
  readonly code: string;
  quote(input: CustomsQuoteInput): Promise<CustomsQuote | null>;
}

export interface StorageProvider {
  readonly code: string;
  quote(input: StorageQuoteInput): Promise<CostQuote | null>;
}

// ---------------------------------------------------------------------------
// Calculator input / output
// ---------------------------------------------------------------------------

export type ComponentInput = {
  id?: string;
  kind: CostKind;
  label: string;
  amount: number;
  amountLow: number | null;
  amountHigh: number | null;
  currency: string;
  inCustomsBase: boolean;
  isRecoverable: boolean;
  /** A real invoice. Locked components have no band: low = expected = high. */
  isLocked: boolean;
};

export type LandedItemInput = {
  id: string;
  quantity: number;
  /** Extended goods value for the line, in the quote currency. */
  goodsValue: number;
  dutyPercent: number;
  vatPercent: number;
  hsCode: string | null;
};

export type LandedInput = {
  quoteCurrency: string;
  /** Units of quoteCurrency per 1 unit of the keyed currency. */
  fxRates: Record<string, number>;
  components: ComponentInput[];
  items: LandedItemInput[];
  /** Widens the band for components that carry no explicit low/high. */
  contingencyPercent: number;
  /** A VAT-registered importer reverse-charges import VAT: cash flow, not cost. */
  vatRecoverable: boolean;
};

export type LandedLine = {
  kind: CostKind;
  label: string;
  amount: number;
  currency: string;
  inCustomsBase: boolean;
  isRecoverable: boolean;
  isLocked: boolean;
};

export type LandedItemResult = {
  id: string;
  quantity: number;
  goodsValue: number;
  apportionedFreight: number;
  cifValue: number;
  duty: number;
  vat: number;
  otherCharges: number;
  landedTotal: number;
  landedUnitCost: number;
};

export type LandedResult = {
  scenario: Scenario;
  currency: string;
  cifValue: number;
  dutyTotal: number;
  vatTotal: number;
  /** What the goods actually cost the business. Excludes recoverable VAT. */
  landedCost: number;
  /** What has to leave the bank account. Always includes VAT. */
  cashOutlay: number;
  lines: LandedLine[];
  items: LandedItemResult[];
  issues: string[];
};

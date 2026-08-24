// Shared types for the product configurator. Deliberately free of Prisma and
// `server-only` imports: every module in this folder is a pure function, so the
// money logic can be unit-tested without a database and reused on the client
// for optimistic UI without dragging the ORM into the bundle.

// ---------------------------------------------------------------------------
// Conditions — the dependency "tree"
// ---------------------------------------------------------------------------

export const COMPARE_OPS = ['<', '<=', '>', '>=', '==', '!='] as const;
export type CompareOp = (typeof COMPARE_OPS)[number];

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { group: string; in: string[] }
  | { group: string; op: CompareOp; value: number };

// Three-valued on purpose. A condition that references a group the user has not
// chosen yet is PENDING, not false: returning false would hide every dependent
// value before the first click and make the configurator look broken, while
// returning true would flash invalid values that then vanish.
export type Truth = 'yes' | 'no' | 'pending';

// Reserved variable for the line quantity. Without it, tier pricing ("360 per
// unit from 50 up") is simply not expressible, because quantity lives on the
// quote item and is not an option group. Group codes may not start with `__`.
export const QUANTITY_VAR = '__qty';
export const RESERVED_PREFIX = '__';

// The chosen base variant, carried in the selection under a reserved code so
// that `{group: '__variant', in: ['alu_wpc']}` is an ordinary condition. The
// alternative — a dedicated variant field threaded through every signature —
// would need a parallel branch in the evaluator, the resolver and the pricer
// to say the one thing the condition language already says.
export const VARIANT_VAR = '__variant';

// ---------------------------------------------------------------------------
// Selection — what the user has chosen so far
// ---------------------------------------------------------------------------

export type SelectionEntry = {
  groupCode: string;
  /** `select` / `multi_select`: chosen value codes, in display order. */
  valueCodes: string[];
  /** `multi_select` only: how many of each value code. Defaults to 1. */
  quantities?: Record<string, number>;
  /**
   * The group's numeric value for conditions and formulas: the raw input for a
   * `number` group, the chosen value's `numericValue` for a `select`, 1/0 for a
   * boolean. Null when the group carries no magnitude (a colour).
   */
  numericValue: number | null;
  /** Carried through to the quote-item snapshot so it survives a hard delete. */
  valueIds?: string[];
};

export type Selection = Record<string, SelectionEntry>;

// ---------------------------------------------------------------------------
// Template shape, as the engine wants it (mapped from Prisma rows by the
// loader in src/lib/configuratorAdmin.ts, so the engine never sees a Decimal)
// ---------------------------------------------------------------------------

export const INPUT_KINDS = ['select', 'number', 'multi_select', 'boolean'] as const;
export type InputKind = (typeof INPUT_KINDS)[number];

export type OptionValueDef = {
  id: string;
  code: string;
  name: string;
  numericValue: number | null;
  /** Exposed to formulas as `<groupCode>_<attributeKey>`. */
  attributes: Record<string, number> | null;
  colorHex: string | null;
  /** Set when the value is a real product (an accessory), for HS code + weight. */
  productId: string | null;
  sortOrder: number;
  /** NULL = always offered. Otherwise gated on the current selection. */
  condition: Condition | null;
  /** What this option includes, when it differs from the question's own text. */
  configText?: string | null;
  imageUrl?: string | null;
};

export type NumericRange = {
  condition: Condition | null;
  min: number | null;
  max: number | null;
  step: number | null;
};

export type OptionDef = {
  id: string;
  groupCode: string;
  name: string;
  helpText: string | null;
  inputKind: InputKind;
  unit: string | null;
  /**
   * Load-bearing, not cosmetic: a condition or formula may only reference
   * groups with a LOWER sortOrder, which makes the dependency graph a DAG by
   * construction rather than something that can oscillate at runtime.
   */
  sortOrder: number;
  isRequired: boolean;
  defaultValueCode: string | null;
  /** Hides the whole group — not just its values. */
  condition: Condition | null;
  /** First match wins; a null condition acts as the default. */
  ranges: NumericRange[];
  values: OptionValueDef[];
  /** Absent or null = asked on every variant. Set = that branch alone. */
  variantCode?: string | null;
  /** Shared "Configuration" text when every option includes the same build. */
  configText?: string | null;
};

export type ConstraintDef = {
  id: string;
  code: string;
  kind: 'forbid' | 'require';
  condition: Condition;
  message: string;
};

export type DerivedQuantityDef = {
  code: string;
  formula: string;
  unit: string | null;
  sortOrder: number;
};

export const PRICING_STAGES = ['base', 'adder', 'multiplier', 'margin', 'discount'] as const;
export type PricingStage = (typeof PRICING_STAGES)[number];

export const PRICING_BASES = ['flat', 'percent', 'per_quantity'] as const;
export type PricingBasis = (typeof PRICING_BASES)[number];

export const APPLY_PER = ['unit', 'line', 'quote'] as const;
export type ApplyPer = (typeof APPLY_PER)[number];

export type PricingRuleDef = {
  id: string;
  code: string;
  condition: Condition | null;
  stage: PricingStage;
  priority: number;
  basis: PricingBasis;
  /** For `per_quantity`: a group code, a derived quantity code, or `__qty`. */
  quantityCode: string | null;
  applyPer: ApplyPer;
  amount: number | null;
  rate: number | null;
  currency: string | null;
};

// ---------------------------------------------------------------------------
// Variants, price grids, upgrades and bands
//
// A supplier does not publish a formula, it publishes a table. The base price
// of a door is a CELL, addressed by several answers at once, and about half of
// the cells in a real list are combinations the factory will not make. None of
// that is expressible as `area x rate`, which is what the rules above assume.
// ---------------------------------------------------------------------------

export type PriceGridDef = {
  id: string;
  currency: string;
  /** Group codes, in axis order. The cell key is built in exactly this order. */
  axes: string[];
  /**
   * Cell key -> price. Three distinct states, and conflating any two of them
   * loses real information:
   *   a number  — sold at this price
   *   `null`    — the editor marked it NOT SOLD (the dash in the supplier list)
   *   absent    — nobody has entered it yet, so the grid is incomplete
   */
  cells: Record<string, number | null>;
};

export type VariantDef = {
  id: string;
  code: string;
  name: string;
  /** What the base price already includes, verbatim from the supplier. */
  includedSpec: string | null;
  imageUrl: string | null;
  sortOrder: number;
  grid: PriceGridDef | null;
};

export const UPGRADE_UNITS = ['flat', 'per_unit', 'per_set', 'per_sqm', 'per_piece'] as const;
export type UpgradeUnit = (typeof UPGRADE_UNITS)[number];

export type UpgradeEffectDef = {
  /** `restrict` narrows a question, `set` forces it, `note` only informs. */
  kind: 'restrict' | 'set' | 'note';
  groupCode: string | null;
  valueCodes: string[];
  message: string | null;
};

export type UpgradeTierDef = { minQty: number; unitAmount: number };

export type UpgradeDef = {
  id: string;
  code: string;
  label: string;
  detail: string | null;
  /** The supplier's own heading, so the editor can mirror their sheet. */
  section: string | null;
  kind: 'upgrade' | 'accessory';
  /** NULL = offered on every variant. */
  variantCode: string | null;
  amount: number;
  unit: UpgradeUnit;
  /** For `per_sqm`: the derived quantity that multiplies the amount. */
  quantityCode: string | null;
  defaultQty: number;
  minQty: number;
  maxQty: number | null;
  productId: string | null;
  condition: Condition | null;
  /** Why it is greyed out — far kinder than hiding it with no explanation. */
  unavailableNote: string | null;
  tiers: UpgradeTierDef[];
  effects: UpgradeEffectDef[];
  sortOrder: number;
};

export type BandDef = {
  id: string;
  code: string;
  label: string;
  /** The numeric question whose answer selects the band. */
  groupCode: string;
  variantCode: string | null;
  /** Half-open [min, max). Either end may be open. */
  min: number | null;
  max: number | null;
  amount: number;
  sortOrder: number;
};

export type TemplateDef = {
  id: string;
  code: string;
  name: string;
  currency: string;
  /** Customs classification for items configured from this template. */
  hsCodeId: string | null;
  /** What every published price already assumes, e.g. a standard opening. */
  standardNote?: string | null;
  options: OptionDef[];
  constraints: ConstraintDef[];
  derivedQuantities: DerivedQuantityDef[];
  rules: PricingRuleDef[];
  // Optional because a template that predates any of this is still valid:
  // absent means "no branches, no add-ons, no size steps", which is exactly
  // what a purely formula-priced product is.
  variants?: VariantDef[];
  upgrades?: UpgradeDef[];
  bands?: BandDef[];
};

// ---------------------------------------------------------------------------
// Resolution output — what the configurator UI renders
// ---------------------------------------------------------------------------

export type ResolvedValue = {
  code: string;
  name: string;
  colorHex: string | null;
  /**
   * `yes` = selectable. `pending` = an earlier choice has to be made first, so
   * the UI shows it disabled with a hint rather than hiding it and leaving the
   * user wondering where it went. `no` = ruled out by the current selection.
   */
  availability: Truth;
};

export type ResolvedOption = {
  groupCode: string;
  name: string;
  helpText: string | null;
  inputKind: InputKind;
  unit: string | null;
  sortOrder: number;
  isVisible: boolean;
  isRequired: boolean;
  range: { min: number | null; max: number | null; step: number | null } | null;
  values: ResolvedValue[];
  selected: string[];
  numericValue: number | null;
};

export type ResolutionIssue = {
  kind: 'missing_required' | 'constraint' | 'out_of_range' | 'formula';
  groupCode?: string;
  code?: string;
  message: string;
};

export type ResolvedUpgrade = {
  code: string;
  label: string;
  detail: string | null;
  section: string | null;
  kind: 'upgrade' | 'accessory';
  unit: UpgradeUnit;
  amount: number;
  /**
   * `no` keeps the row on screen, greyed, with `unavailableNote` explaining
   * why. Hiding it instead leaves a salesperson hunting for an upgrade the
   * customer is asking about by name.
   */
  availability: Truth;
  unavailableNote: string | null;
  defaultQty: number;
  minQty: number;
  maxQty: number | null;
  hasTiers: boolean;
  effects: UpgradeEffectDef[];
};

/**
 * Why a base price could not be read out of the grid. Distinguishing these
 * matters: `not_sold` is a fact to tell the customer, `not_entered` is a hole
 * in the company's own data, and `incomplete` just means keep answering.
 */
export type GridState = 'sold' | 'not_sold' | 'not_entered' | 'incomplete' | 'no_grid';

export type GridLookup = {
  state: GridState;
  amount: number | null;
  currency: string | null;
  /** The composed cell key, for the audit trail and for debugging a mismatch. */
  key: string | null;
  /** Axes still unanswered, when `state` is `incomplete`. */
  missingAxes: string[];
};

export type Resolution = {
  options: ResolvedOption[];
  /** Formula results by code. A null value means the formula failed. */
  derived: Record<string, number | null>;
  issues: ResolutionIssue[];
  /** True when the selection is complete and violates nothing. */
  isComplete: boolean;
  /** The chosen branch. Null until one is picked. */
  variantCode: string | null;
  /** Base price from the variant's grid. */
  grid: GridLookup;
  upgrades: ResolvedUpgrade[];
};

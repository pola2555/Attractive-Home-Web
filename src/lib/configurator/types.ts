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

export type TemplateDef = {
  id: string;
  code: string;
  name: string;
  currency: string;
  /** Customs classification for items configured from this template. */
  hsCodeId: string | null;
  options: OptionDef[];
  constraints: ConstraintDef[];
  derivedQuantities: DerivedQuantityDef[];
  rules: PricingRuleDef[];
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

export type Resolution = {
  options: ResolvedOption[];
  /** Formula results by code. A null value means the formula failed. */
  derived: Record<string, number | null>;
  issues: ResolutionIssue[];
  /** True when the selection is complete and violates nothing. */
  isComplete: boolean;
};

import { evaluateCondition, isSatisfied, type ConditionScope } from './condition';
import { evaluateFormula, referencedVariables } from './formula';
import { lookupGrid, selectedVariantCode, variantByCode } from './grid';
import {
  activeEffects,
  allowedValues,
  upgradeAvailability,
  upgradesForVariant,
  type UpgradeSelection,
} from './upgrades';
import type {
  DerivedQuantityDef,
  OptionDef,
  Resolution,
  ResolutionIssue,
  ResolvedOption,
  ResolvedUpgrade,
  Selection,
  TemplateDef,
} from './types';

// Turns a template plus a partial selection into what the configurator should
// render right now: which groups are visible, which values are selectable, the
// active numeric range, the derived quantities, and everything currently wrong.

// Formula variables are flat identifiers, because the parser's grammar has no
// member access. A group contributes its own numeric value under its code, and
// each attribute of the SELECTED value under `<group>_<attribute>` — which is
// how `weight_kg = volume_m3 * door_material_density` reaches the density of
// whichever material happens to be chosen.
export function buildFormulaScope(
  template: TemplateDef,
  selection: Selection,
  derived: Record<string, number | null> = {},
): Record<string, number> {
  const scope: Record<string, number> = {};

  for (const option of template.options) {
    const entry = selection[option.groupCode];
    if (!entry) continue;
    if (entry.numericValue !== null && Number.isFinite(entry.numericValue)) {
      scope[option.groupCode] = entry.numericValue;
    }
    for (const code of entry.valueCodes) {
      const value = option.values.find((v) => v.code === code);
      if (!value?.attributes) continue;
      for (const [key, attribute] of Object.entries(value.attributes)) {
        if (typeof attribute === 'number' && Number.isFinite(attribute)) {
          scope[`${option.groupCode}_${key}`] = attribute;
        }
      }
    }
  }

  for (const [code, value] of Object.entries(derived)) {
    if (value !== null && Number.isFinite(value)) scope[code] = value;
  }

  return scope;
}

// Evaluated in sortOrder so a quantity can build on an earlier one. A failure
// is recorded as null plus an issue — never as 0 (see formula.ts).
export function computeDerived(
  template: TemplateDef,
  selection: Selection,
): { derived: Record<string, number | null>; issues: ResolutionIssue[] } {
  const derived: Record<string, number | null> = {};
  const issues: ResolutionIssue[] = [];
  const ordered = [...template.derivedQuantities].sort(
    (a: DerivedQuantityDef, b: DerivedQuantityDef) => a.sortOrder - b.sortOrder,
  );

  // Names a formula may reference that nobody is OBLIGED to answer. A required
  // question left blank is a different story: the resolver already reports it
  // as `missing_required`, and a formula that silently went pending on one
  // would hide a genuinely incomplete configuration.
  const optionalNames = new Set<string>(template.derivedQuantities.map((q) => q.code));
  const required = new Set(
    template.options.filter((option) => option.isRequired).map((option) => option.groupCode),
  );
  for (const option of template.options) {
    if (required.has(option.groupCode)) continue;
    optionalNames.add(option.groupCode);
    for (const value of option.values) {
      for (const key of Object.keys(value.attributes ?? {})) {
        optionalNames.add(`${option.groupCode}_${key}`);
      }
    }
  }

  for (const quantity of ordered) {
    const scope = buildFormulaScope(template, selection, derived);
    const result = evaluateFormula(quantity.formula, scope);
    if (result.ok) {
      derived[quantity.code] = result.value;
      continue;
    }

    derived[quantity.code] = null;

    // A formula whose only problem is an OPTIONAL question nobody has answered
    // yet is pending, not broken — the same three-valued reasoning conditions
    // use. Reporting it would block a configuration over a wall-panel area
    // that matters only if somebody ticks the wall panel, and the upgrade that
    // needs it already refuses loudly on its own behalf rather than charging
    // zero.
    const unresolved = [...referencedVariables(quantity.formula)].filter(
      (name) => !(name in scope),
    );
    const merelyUnanswered =
      unresolved.length > 0 && unresolved.every((name) => optionalNames.has(name));
    if (merelyUnanswered) continue;

    issues.push({
      kind: 'formula',
      code: quantity.code,
      message: `${quantity.code}: ${result.error}`,
    });
  }

  return { derived, issues };
}

// First range whose condition is definitely satisfied wins; a null condition
// acts as the default. A `pending` condition falls through rather than
// applying a range the user has not qualified for yet.
export function activeRange(option: OptionDef, scope: ConditionScope) {
  for (const range of option.ranges) {
    if (range.condition === null || isSatisfied(range.condition, scope)) {
      return { min: range.min, max: range.max, step: range.step };
    }
  }
  return null;
}

/**
 * The questions that belong to one branch: shared ones, plus that branch's own,
 * with a branch binding OVERRIDING a shared one for the same question.
 *
 * Every consumer has to agree on this list. Reading `template.options` raw is a
 * real bug rather than an inefficiency: the same question can be bound once per
 * branch with DIFFERENT answers — board material is three options on the
 * aluminium frame and one on the wood frame — so an unscoped pass sees the
 * wrong branch's answers and clears a perfectly valid selection.
 */
export function optionsForVariant(template: TemplateDef, variantCode: string | null): OptionDef[] {
  const applicable = template.options.filter(
    (option) => (option.variantCode ?? null) === null || option.variantCode === variantCode,
  );
  const byGroup = new Map<string, OptionDef>();
  for (const option of applicable) {
    const existing = byGroup.get(option.groupCode);
    if (!existing || (option.variantCode ?? null) !== null) byGroup.set(option.groupCode, option);
  }
  return [...byGroup.values()];
}

export function resolveConfiguration(
  template: TemplateDef,
  selection: Selection,
  quantity = 1,
  picked: UpgradeSelection = {},
): Resolution {
  const scope: ConditionScope = { selection, quantity };
  const issues: ResolutionIssue[] = [];
  const options: ResolvedOption[] = [];

  const variantCode = selectedVariantCode(selection);
  const variant = variantByCode(template.variants ?? [], variantCode);

  // Questions belonging to another branch are not hidden — they are not part
  // of this product at all. A wood-frame door has no "Thickness" question to
  // hide, and leaving it in the list to be filtered downstream would let it
  // reach the grid key and the required-field check.
  const forVariant = optionsForVariant(template, variantCode);

  const upgrades = upgradesForVariant(template.upgrades ?? [], variantCode);
  const effects = activeEffects(upgrades, picked, selection, quantity);

  const ordered = [...forVariant].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const option of ordered) {
    // A group is shown only on a definite yes. Showing it while its condition
    // is still pending would flash a group that then disappears.
    const isVisible = evaluateCondition(option.condition, scope) === 'yes';
    const entry = selection[option.groupCode];
    const range = option.inputKind === 'number' ? activeRange(option, scope) : null;

    // An upgrade can narrow another question: choosing the widest size band
    // leaves five colours out of eleven. The narrowing is applied on top of
    // the value's own condition, and it can only ever remove — an effect must
    // not resurrect a value the tree already ruled out.
    const sorted = [...option.values].sort((a, b) => a.sortOrder - b.sortOrder);
    const permitted = allowedValues(
      effects,
      option.groupCode,
      sorted.map((v) => v.code),
    );
    const values = sorted.map((value) => {
      const own = evaluateCondition(value.condition, scope);
      const availability = own === 'yes' && !permitted.includes(value.code) ? 'no' : own;
      return {
        code: value.code,
        name: value.name,
        colorHex: value.colorHex,
        availability,
      };
    });

    options.push({
      groupCode: option.groupCode,
      name: option.name,
      helpText: option.helpText,
      inputKind: option.inputKind,
      unit: option.unit,
      sortOrder: option.sortOrder,
      isVisible,
      isRequired: option.isRequired && isVisible,
      range,
      values,
      selected: entry?.valueCodes ?? [],
      numericValue: entry?.numericValue ?? null,
    });

    if (!isVisible) continue;

    const hasSelection =
      option.inputKind === 'number' || option.inputKind === 'boolean'
        ? entry?.numericValue !== null && entry?.numericValue !== undefined
        : (entry?.valueCodes.length ?? 0) > 0;

    if (option.isRequired && !hasSelection) {
      issues.push({
        kind: 'missing_required',
        groupCode: option.groupCode,
        message: `${option.name} is required.`,
      });
    }

    // A chosen value that the current selection has ruled out. When an upgrade
    // is what ruled it out, say which one: "not available" sends a salesperson
    // hunting through the tree for a cause that is actually a tick box.
    for (const code of entry?.valueCodes ?? []) {
      const resolved = values.find((v) => v.code === code);
      if (!resolved || resolved.availability !== 'no') continue;

      const culprit = effects.find(
        (e) =>
          e.groupCode === option.groupCode &&
          (e.kind === 'restrict' || e.kind === 'set') &&
          !e.valueCodes.includes(code),
      );

      issues.push({
        kind: 'constraint',
        groupCode: option.groupCode,
        message: culprit
          ? (culprit.message ??
            `${resolved.name} is not available once "${culprit.upgradeLabel}" is selected.`)
          : `${resolved.name} is not available with the current selection.`,
      });
    }

    // Out-of-range is flagged, never silently clamped: width is a priced
    // dimension, and quietly changing it would alter a number the user thinks
    // they chose.
    if (range && entry?.numericValue !== null && entry?.numericValue !== undefined) {
      const value = entry.numericValue;
      if (range.min !== null && value < range.min) {
        issues.push({
          kind: 'out_of_range',
          groupCode: option.groupCode,
          message: `${option.name} must be at least ${range.min}${option.unit ? ` ${option.unit}` : ''}.`,
        });
      }
      if (range.max !== null && value > range.max) {
        issues.push({
          kind: 'out_of_range',
          groupCode: option.groupCode,
          message: `${option.name} must be at most ${range.max}${option.unit ? ` ${option.unit}` : ''} with the current selection.`,
        });
      }
    }
  }

  // Cross-group constraints, evaluated against the COMPLETE selection. This is
  // where combinations that no single value can veto get caught.
  for (const constraint of template.constraints) {
    const truth = evaluateCondition(constraint.condition, scope);
    const violated = constraint.kind === 'forbid' ? truth === 'yes' : truth === 'no';
    if (violated) {
      issues.push({ kind: 'constraint', code: constraint.code, message: constraint.message });
    }
  }

  const { derived, issues: derivedIssues } = computeDerived(template, selection);

  // A formula that cannot resolve yet because an input is still unchosen is not
  // an error worth showing — the missing_required issue already says so.
  const hasMissingRequired = issues.some((i) => i.kind === 'missing_required');
  if (!hasMissingRequired) issues.push(...derivedIssues);

  // A product with variants but none chosen is not yet a product.
  if ((template.variants ?? []).length > 0 && !variant) {
    issues.push({ kind: 'missing_required', message: 'Choose a base variant first.' });
  }

  const grid = lookupGrid(variant?.grid ?? null, selection);
  if (grid.state === 'not_sold') {
    issues.push({
      kind: 'constraint',
      message: 'The supplier does not sell this combination. Change one of the base answers.',
    });
  }
  if (grid.state === 'not_entered') {
    issues.push({
      kind: 'constraint',
      message:
        'No price has been entered for this combination. Ask whoever maintains the price list to fill the gap.',
    });
  }

  const resolvedUpgrades: ResolvedUpgrade[] = upgrades.map((upgrade) => ({
    code: upgrade.code,
    label: upgrade.label,
    detail: upgrade.detail,
    section: upgrade.section,
    kind: upgrade.kind,
    unit: upgrade.unit,
    amount: upgrade.amount,
    availability: upgradeAvailability(upgrade, selection, quantity),
    unavailableNote: upgrade.unavailableNote,
    defaultQty: upgrade.defaultQty,
    minQty: upgrade.minQty,
    maxQty: upgrade.maxQty,
    hasTiers: upgrade.tiers.length > 0,
    effects: upgrade.effects,
  }));

  return {
    options,
    derived,
    issues,
    isComplete: issues.length === 0,
    variantCode,
    grid,
    upgrades: resolvedUpgrades,
  };
}

// After a change, drop any selection the new state has invalidated, working
// forwards so a cleared group can invalidate the ones after it. Returns a new
// object; the input is not mutated.
export function cascadeSelection(
  template: TemplateDef,
  selection: Selection,
  quantity = 1,
): Selection {
  const next: Selection = { ...selection };
  const ordered = [...optionsForVariant(template, selectedVariantCode(selection))].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  for (const option of ordered) {
    const scope: ConditionScope = { selection: next, quantity };
    const entry = next[option.groupCode];
    if (!entry) continue;

    // A hidden group cannot hold a selection.
    if (evaluateCondition(option.condition, scope) !== 'yes') {
      delete next[option.groupCode];
      continue;
    }

    if (option.inputKind === 'number' || option.inputKind === 'boolean') continue;

    const stillAvailable = entry.valueCodes.filter((code) => {
      const value = option.values.find((v) => v.code === code);
      if (!value) return false;
      return evaluateCondition(value.condition, scope) === 'yes';
    });

    if (stillAvailable.length === entry.valueCodes.length) continue;

    if (stillAvailable.length === 0) {
      delete next[option.groupCode];
    } else {
      const chosen = option.values.filter((v) => stillAvailable.includes(v.code));
      next[option.groupCode] = {
        ...entry,
        valueCodes: stillAvailable,
        valueIds: chosen.map((v) => v.id),
        numericValue: chosen[0]?.numericValue ?? null,
      };
    }
  }

  return next;
}

// Human-readable summary of a selection, stored on the quote item so the line
// stays legible even after the option values behind it are gone.
export function describeSelection(template: TemplateDef, selection: Selection): string {
  const parts: string[] = [];
  // Scoped for the same reason as the cascade: a question bound to both
  // branches would otherwise contribute its answer to the label twice.
  const ordered = optionsForVariant(template, selectedVariantCode(selection)).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  for (const option of ordered) {
    const entry = selection[option.groupCode];
    if (!entry) continue;
    if (option.inputKind === 'number') {
      if (entry.numericValue === null) continue;
      parts.push(`${entry.numericValue}${option.unit ? ` ${option.unit}` : ''}`);
      continue;
    }
    const names = entry.valueCodes
      .map((code) => {
        const value = option.values.find((v) => v.code === code);
        const qty = entry.quantities?.[code];
        const label = value?.name ?? code;
        return qty && qty > 1 ? `${label} ×${qty}` : label;
      })
      .filter(Boolean);
    if (names.length) parts.push(names.join(' + '));
  }
  return parts.join(', ');
}

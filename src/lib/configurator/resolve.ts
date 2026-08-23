import { evaluateCondition, isSatisfied, type ConditionScope } from './condition';
import { evaluateFormula } from './formula';
import type {
  DerivedQuantityDef,
  OptionDef,
  Resolution,
  ResolutionIssue,
  ResolvedOption,
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

  for (const quantity of ordered) {
    const scope = buildFormulaScope(template, selection, derived);
    const result = evaluateFormula(quantity.formula, scope);
    if (result.ok) {
      derived[quantity.code] = result.value;
    } else {
      derived[quantity.code] = null;
      issues.push({
        kind: 'formula',
        code: quantity.code,
        message: `${quantity.code}: ${result.error}`,
      });
    }
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

export function resolveConfiguration(
  template: TemplateDef,
  selection: Selection,
  quantity = 1,
): Resolution {
  const scope: ConditionScope = { selection, quantity };
  const issues: ResolutionIssue[] = [];
  const options: ResolvedOption[] = [];

  const ordered = [...template.options].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const option of ordered) {
    // A group is shown only on a definite yes. Showing it while its condition
    // is still pending would flash a group that then disappears.
    const isVisible = evaluateCondition(option.condition, scope) === 'yes';
    const entry = selection[option.groupCode];
    const range = option.inputKind === 'number' ? activeRange(option, scope) : null;

    const values = [...option.values]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((value) => ({
        code: value.code,
        name: value.name,
        colorHex: value.colorHex,
        availability: evaluateCondition(value.condition, scope),
      }));

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

    // A chosen value that the current selection has ruled out.
    for (const code of entry?.valueCodes ?? []) {
      const resolved = values.find((v) => v.code === code);
      if (resolved && resolved.availability === 'no') {
        issues.push({
          kind: 'constraint',
          groupCode: option.groupCode,
          message: `${resolved.name} is not available with the current selection.`,
        });
      }
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

  return { options, derived, issues, isComplete: issues.length === 0 };
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
  const ordered = [...template.options].sort((a, b) => a.sortOrder - b.sortOrder);

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
  for (const option of [...template.options].sort((a, b) => a.sortOrder - b.sortOrder)) {
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

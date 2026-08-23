import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { doorTemplate, number, oakDoorSelection, select } from './fixtures.test-support';
import {
  cascadeSelection,
  computeDerived,
  describeSelection,
  resolveConfiguration,
} from './resolve';
import type { Selection } from './types';

const template = doorTemplate();

function option(selection: Selection, groupCode: string) {
  const resolution = resolveConfiguration(template, selection);
  const found = resolution.options.find((o) => o.groupCode === groupCode);
  assert.ok(found, `expected an option for ${groupCode}`);
  return found;
}

describe('the dependency tree', () => {
  it('gates walnut stain on the material chosen before it', () => {
    const availability = (selection: Selection) =>
      option(selection, 'finish_color').values.find((v) => v.code === 'walnut_stain')?.availability;

    assert.equal(availability({}), 'pending', 'no material chosen yet');
    assert.equal(availability({ door_material: select('door_material', 'solid_oak') }), 'yes');
    assert.equal(availability({ door_material: select('door_material', 'mdf') }), 'no');
  });

  it('leaves unconditional values available from the start', () => {
    assert.equal(
      option({}, 'finish_color').values.find((v) => v.code === 'natural')?.availability,
      'yes',
    );
  });

  it('hides a whole group, not just its values, when its condition fails', () => {
    // Hiding only the values would leave an empty REQUIRED select that can
    // never be satisfied.
    assert.equal(option({}, 'glazing').isVisible, false, 'hidden while door type is unknown');
    assert.equal(option({ door_type: select('door_type', 'solid') }, 'glazing').isVisible, false);
    assert.equal(option({ door_type: select('door_type', 'glazed') }, 'glazing').isVisible, true);
  });

  it('does not require a hidden group', () => {
    const glazing = option({ door_type: select('door_type', 'solid') }, 'glazing');
    assert.equal(glazing.isRequired, false);
  });
});

describe('conditional numeric ranges', () => {
  // A `number` group has no option_values rows, so there is nowhere to hang a
  // per-value condition. Ranges are the only home for this rule.
  it('narrows the maximum width for a thin door', () => {
    assert.deepEqual(option({ thickness: number('thickness', 40) }, 'width').range, {
      min: 600,
      max: 1200,
      step: 10,
    });
  });

  it('allows the full width once the door is thick enough', () => {
    assert.deepEqual(option({ thickness: number('thickness', 45) }, 'width').range, {
      min: 600,
      max: 1400,
      step: 10,
    });
  });

  it('falls back to the default range while the condition is still pending', () => {
    assert.deepEqual(option({}, 'width').range, { min: 600, max: 1400, step: 10 });
  });

  it('raises the minimum thickness for aluminium', () => {
    assert.deepEqual(
      option({ door_material: select('door_material', 'aluminium') }, 'thickness').range,
      { min: 40, max: 80, step: 5 },
    );
  });

  it('flags an out-of-range value rather than silently clamping a priced dimension', () => {
    const selection = { ...oakDoorSelection(), width: number('width', 1300) };
    const thin = { ...selection, thickness: number('thickness', 40) };
    const issues = resolveConfiguration(template, thin).issues;
    assert.ok(
      issues.some((i) => i.kind === 'out_of_range' && i.groupCode === 'width'),
      `expected an out_of_range issue, got ${JSON.stringify(issues)}`,
    );
  });
});

describe('cross-group constraints', () => {
  it('catches a three-way combination no single value could veto', () => {
    // Each of MDF, 1300 mm and 45 mm is individually fine.
    const selection: Selection = {
      ...oakDoorSelection(),
      door_material: select('door_material', 'mdf'),
      width: number('width', 1300),
      thickness: number('thickness', 45),
    };
    const resolution = resolveConfiguration(template, selection);
    assert.ok(resolution.issues.some((i) => i.code === 'mdf_wide_thick'));
    assert.equal(resolution.isComplete, false);
  });

  it('stays silent when only part of the combination is present', () => {
    const selection: Selection = {
      ...oakDoorSelection(),
      door_material: select('door_material', 'mdf'),
      width: number('width', 1100),
    };
    const resolution = resolveConfiguration(template, selection);
    assert.equal(
      resolution.issues.some((i) => i.code === 'mdf_wide_thick'),
      false,
    );
  });
});

describe('derived quantities', () => {
  it('chains area -> volume -> weight using the selected material density', () => {
    const { derived } = computeDerived(template, oakDoorSelection());
    assert.equal(derived.area_m2, 1.89);
    assert.equal(round6(derived.volume_m3 ?? 0), 0.08505);
    assert.equal(round6(derived.weight_kg ?? 0), 59.535);
  });

  it('follows the material, so weight changes with density', () => {
    const aluminium: Selection = {
      ...oakDoorSelection(),
      door_material: select('door_material', 'aluminium'),
    };
    const { derived } = computeDerived(template, aluminium);
    assert.equal(round6(derived.weight_kg ?? 0), round6(0.08505 * 2700));
  });

  it('reports null and an issue when an input is missing — never zero', () => {
    const { derived, issues } = computeDerived(template, {
      height: number('height', 2100),
    });
    assert.equal(derived.area_m2, null);
    assert.equal(derived.weight_kg, null);
    assert.ok(issues.length > 0);
  });
});

describe('completeness', () => {
  it('accepts a fully specified valid door', () => {
    const resolution = resolveConfiguration(template, oakDoorSelection());
    assert.deepEqual(resolution.issues, []);
    assert.equal(resolution.isComplete, true);
  });

  it('reports each missing required group', () => {
    const resolution = resolveConfiguration(template, {});
    const missing = resolution.issues
      .filter((i) => i.kind === 'missing_required')
      .map((i) => i.groupCode);
    assert.deepEqual(missing.sort(), [
      'door_material',
      'door_type',
      'finish_color',
      'height',
      'thickness',
      'width',
    ]);
  });

  it('requires glazing once the door is glazed', () => {
    const selection: Selection = {
      ...oakDoorSelection(),
      door_type: select('door_type', 'glazed'),
    };
    const resolution = resolveConfiguration(template, selection);
    assert.ok(
      resolution.issues.some((i) => i.kind === 'missing_required' && i.groupCode === 'glazing'),
    );
  });
});

describe('cascade', () => {
  it('clears a colour the new material has ruled out', () => {
    const selection: Selection = {
      ...oakDoorSelection(),
      finish_color: select('finish_color', 'walnut_stain'),
      door_material: select('door_material', 'mdf'),
    };
    const next = cascadeSelection(template, selection);
    assert.equal(next.finish_color, undefined, 'walnut stain must not survive on MDF');
    assert.ok(next.door_material, 'the change that caused it stays');
  });

  it('keeps a colour that is still valid', () => {
    const next = cascadeSelection(template, oakDoorSelection());
    assert.deepEqual(next.finish_color?.valueCodes, ['natural']);
  });

  it('clears a hidden group', () => {
    const selection: Selection = {
      ...oakDoorSelection(),
      door_type: select('door_type', 'solid'),
      glazing: select('glazing', 'double'),
    };
    assert.equal(cascadeSelection(template, selection).glazing, undefined);
  });

  it('does not mutate its input', () => {
    const selection: Selection = {
      ...oakDoorSelection(),
      finish_color: select('finish_color', 'walnut_stain'),
      door_material: select('door_material', 'mdf'),
    };
    cascadeSelection(template, selection);
    assert.deepEqual(selection.finish_color?.valueCodes, ['walnut_stain']);
  });
});

describe('describeSelection', () => {
  it('renders a readable label in template order', () => {
    assert.equal(
      describeSelection(template, oakDoorSelection()),
      'Solid, Solid oak, 45 mm, 2100 mm, 900 mm, Natural',
    );
  });

  it('shows accessory quantities', () => {
    const selection: Selection = {
      ...oakDoorSelection(),
      accessories: {
        groupCode: 'accessories',
        valueCodes: ['hinge', 'handle'],
        quantities: { hinge: 3 },
        numericValue: null,
      },
    };
    assert.match(describeSelection(template, selection), /Concealed hinge ×3 \+ Lever handle/);
  });
});

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

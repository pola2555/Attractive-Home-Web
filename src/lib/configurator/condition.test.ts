import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateCondition, referencedGroups } from './condition';
import { number, select } from './fixtures.test-support';
import type { CompareOp, Condition, Selection } from './types';

const empty: Selection = {};
const oak: Selection = { door_material: select('door_material', 'solid_oak') };

describe('three-valued evaluation', () => {
  it('is pending, not false, before the referenced group is chosen', () => {
    // The whole reason for the third value: answering `no` here would hide
    // every dependent option on first render.
    const condition: Condition = { group: 'door_material', in: ['solid_oak'] };
    assert.equal(evaluateCondition(condition, { selection: empty }), 'pending');
    assert.equal(evaluateCondition(condition, { selection: oak }), 'yes');
    assert.equal(
      evaluateCondition(condition, {
        selection: { door_material: select('door_material', 'mdf') },
      }),
      'no',
    );
  });

  it('treats a null condition as unconditionally available', () => {
    assert.equal(evaluateCondition(null, { selection: empty }), 'yes');
  });

  it('lets one definite failure sink an `all`, even with pendings alongside', () => {
    const condition: Condition = {
      all: [
        { group: 'door_material', in: ['mdf'] }, // no
        { group: 'thickness', op: '>=', value: 45 }, // pending
      ],
    };
    assert.equal(evaluateCondition(condition, { selection: oak }), 'no');
  });

  it('stays pending on an `all` where nothing has failed yet', () => {
    const condition: Condition = {
      all: [
        { group: 'door_material', in: ['solid_oak'] }, // yes
        { group: 'thickness', op: '>=', value: 45 }, // pending
      ],
    };
    assert.equal(evaluateCondition(condition, { selection: oak }), 'pending');
  });

  it('lets one definite success carry an `any`', () => {
    const condition: Condition = {
      any: [
        { group: 'door_material', in: ['solid_oak'] }, // yes
        { group: 'thickness', op: '>=', value: 45 }, // pending
      ],
    };
    assert.equal(evaluateCondition(condition, { selection: oak }), 'yes');
  });

  it('propagates pending through `not` rather than inventing an answer', () => {
    const condition: Condition = { not: { group: 'thickness', op: '>=', value: 45 } };
    assert.equal(evaluateCondition(condition, { selection: empty }), 'pending');
    assert.equal(
      evaluateCondition(condition, { selection: { thickness: number('thickness', 30) } }),
      'yes',
    );
  });

  it('uses vacuous truth for empty groupings', () => {
    assert.equal(evaluateCondition({ all: [] }, { selection: empty }), 'yes');
    assert.equal(evaluateCondition({ any: [] }, { selection: empty }), 'no');
  });
});

describe('numeric comparison', () => {
  const selection: Selection = { thickness: number('thickness', 45) };
  const cases: [CompareOp, number, boolean][] = [
    ['<', 50, true],
    ['<', 45, false],
    ['<=', 45, true],
    ['>', 40, true],
    ['>=', 45, true],
    ['==', 45, true],
    ['!=', 45, false],
  ];

  for (const [op, value, expected] of cases) {
    it(`thickness 45 ${op} ${value} is ${expected}`, () => {
      const condition = { group: 'thickness', op, value } as Condition;
      assert.equal(evaluateCondition(condition, { selection }), expected ? 'yes' : 'no');
    });
  }

  it('refuses to guess on an unknown operator', () => {
    const condition = { group: 'thickness', op: '<<>>', value: 1 } as unknown as Condition;
    assert.equal(evaluateCondition(condition, { selection }), 'pending');
  });
});

describe('the __qty pseudo-variable', () => {
  it('reads the line quantity, which is what makes tier pricing expressible', () => {
    const condition: Condition = { group: '__qty', op: '>=', value: 50 };
    assert.equal(evaluateCondition(condition, { selection: empty, quantity: 50 }), 'yes');
    assert.equal(evaluateCondition(condition, { selection: empty, quantity: 49 }), 'no');
  });

  it('is pending when no quantity is supplied', () => {
    const condition: Condition = { group: '__qty', op: '>=', value: 50 };
    assert.equal(evaluateCondition(condition, { selection: empty }), 'pending');
  });

  it('is not reported as a group dependency, since it is not one', () => {
    const groups = referencedGroups({
      all: [
        { group: '__qty', op: '>=', value: 50 },
        { group: 'door_material', in: ['mdf'] },
      ],
    });
    assert.deepEqual([...groups], ['door_material']);
  });
});

describe('multi_select membership', () => {
  it('matches when any chosen value is listed', () => {
    const selection: Selection = { accessories: select('accessories', 'hinge', 'closer') };
    assert.equal(evaluateCondition({ group: 'accessories', in: ['closer'] }, { selection }), 'yes');
    assert.equal(
      evaluateCondition({ group: 'accessories', in: ['seal_kit'] }, { selection }),
      'no',
    );
  });
});

describe('referencedGroups', () => {
  it('collects every group a nested condition depends on, for the DAG check', () => {
    const groups = referencedGroups({
      any: [
        { group: 'door_material', in: ['mdf'] },
        {
          not: {
            all: [
              { group: 'thickness', op: '>', value: 40 },
              { group: 'width', in: ['x'] },
            ],
          },
        },
      ],
    });
    assert.deepEqual([...groups].sort(), ['door_material', 'thickness', 'width']);
  });
});

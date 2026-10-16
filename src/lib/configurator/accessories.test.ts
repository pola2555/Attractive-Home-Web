import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accessoryTierFor,
  priceAccessories,
  type AccessoryDef,
} from './accessories';

const lock: AccessoryDef = {
  id: 'lock',
  name: 'Lever lock',
  category: 'Locks',
  colorName: null,
  pricingMode: 'per_item',
  unitPrice: 22,
  tiers: [],
};
const pamphlet: AccessoryDef = {
  id: 'pam',
  name: 'Colour pamphlet',
  category: 'Marketing',
  colorName: null,
  pricingMode: 'bulk',
  unitPrice: null,
  tiers: [
    { minQty: 1, unitAmount: 30 },
    { minQty: 100, unitAmount: 15 },
    { minQty: 200, unitAmount: 10 },
  ],
};

test('per-item accessory is unit price × quantity', () => {
  const r = priceAccessories([lock], { lock: 4 });
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].unitAmount, 22);
  assert.equal(r.lines[0].amount, 88);
  assert.equal(r.total, 88);
  assert.deepEqual(r.issues, []);
});

test('bulk accessory uses the highest tier at or below the quantity', () => {
  assert.equal(accessoryTierFor(pamphlet.tiers, 1)?.minQty, 1);
  assert.equal(accessoryTierFor(pamphlet.tiers, 150)?.minQty, 100);
  assert.equal(accessoryTierFor(pamphlet.tiers, 500)?.minQty, 200);
  const r = priceAccessories([pamphlet], { pam: 150 });
  assert.equal(r.lines[0].unitAmount, 15);
  assert.equal(r.total, 2250);
});

test('zero and unknown selections are skipped (unknown raises an issue)', () => {
  const r = priceAccessories([lock], { lock: 0, ghost: 3 });
  assert.equal(r.lines.length, 0);
  assert.equal(r.total, 0);
  assert.equal(r.issues.length, 1);
});

test('several accessories sum, sorted by name', () => {
  const r = priceAccessories([lock, pamphlet], { lock: 2, pam: 100 });
  assert.equal(r.total, 22 * 2 + 15 * 100);
  assert.deepEqual(
    r.lines.map((l) => l.name),
    ['Colour pamphlet', 'Lever lock'],
  );
});

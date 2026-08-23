import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chargeableQuantity, roundUpToHalfKg } from './chargeable';

describe('sea LCL — revenue tons', () => {
  it('bills volume when the cargo is bulky', () => {
    // 3 CBM against 1.2 tonnes -> volume wins.
    const result = chargeableQuantity('sea_lcl', {
      grossWeightKg: 1200,
      volumeCbm: 3,
      packagingFactor: 1,
    });
    assert.equal(result.unit, 'wm');
    assert.equal(result.quantity, 3);
    assert.equal(result.detail.billedOn, 'volume');
  });

  it('bills weight when the cargo is dense', () => {
    // The comparison is CBM against TONNES, not kilograms — 2000 kg is 2 W/M.
    const result = chargeableQuantity('sea_lcl', {
      grossWeightKg: 2000,
      volumeCbm: 1.5,
      packagingFactor: 1,
    });
    assert.equal(result.quantity, 2);
    assert.equal(result.detail.billedOn, 'weight');
  });

  it('applies the 1 W/M minimum to a tiny shipment', () => {
    const result = chargeableQuantity('sea_lcl', {
      grossWeightKg: 40,
      volumeCbm: 0.2,
      packagingFactor: 1,
    });
    assert.equal(result.quantity, 1);
    assert.equal(result.detail.minimumApplied, 'yes');
  });
});

describe('air — chargeable kilograms', () => {
  it('bills volumetric weight for light bulky cargo', () => {
    // 2 CBM = 2,000,000 cm3 / 6000 = 333.33 kg volumetric, against 120 kg gross.
    const result = chargeableQuantity('air', {
      grossWeightKg: 120,
      volumeCbm: 2,
      volumetricDivisor: 6000,
      packagingFactor: 1,
    });
    assert.equal(result.unit, 'kg');
    assert.equal(result.quantity, 333.5); // rounded up to the next half kilo
    assert.equal(result.detail.billedOn, 'volumetric weight');
  });

  it('bills gross weight for dense cargo', () => {
    const result = chargeableQuantity('air', {
      grossWeightKg: 500,
      volumeCbm: 1,
      volumetricDivisor: 6000,
      packagingFactor: 1,
    });
    assert.equal(result.quantity, 500);
    assert.equal(result.detail.billedOn, 'gross weight');
  });

  it('honours a carrier divisor of 5000 rather than assuming 6000', () => {
    // The reason the divisor lives on the rate row: express carriers differ,
    // and a hardcoded constant would never reconcile with their invoice.
    const six = chargeableQuantity('air', {
      grossWeightKg: 10,
      volumeCbm: 1,
      volumetricDivisor: 6000,
      packagingFactor: 1,
    });
    const five = chargeableQuantity('air', {
      grossWeightKg: 10,
      volumeCbm: 1,
      volumetricDivisor: 5000,
      packagingFactor: 1,
    });
    assert.equal(six.quantity, 167); // 1,000,000 / 6000 = 166.67, rounded up
    assert.equal(five.quantity, 200);
  });

  it('falls back to the IATA divisor when none is supplied', () => {
    const result = chargeableQuantity('air', { grossWeightKg: 10, volumeCbm: 1 });
    assert.equal(result.detail.divisor, 6000);
  });

  it('rounds up to the next half kilo, never down', () => {
    assert.equal(roundUpToHalfKg(100.01), 100.5);
    assert.equal(roundUpToHalfKg(100.5), 100.5);
    assert.equal(roundUpToHalfKg(100.51), 101);
  });
});

describe('sea FCL — containers', () => {
  it('bills whole containers and ignores weight entirely', () => {
    const result = chargeableQuantity('sea_fcl', {
      grossWeightKg: 18000,
      volumeCbm: 55,
      containerCount: 2,
    });
    assert.equal(result.unit, 'container');
    assert.equal(result.quantity, 2);
  });

  it('never bills less than one container', () => {
    const result = chargeableQuantity('sea_fcl', {
      grossWeightKg: 100,
      volumeCbm: 1,
      containerCount: 0,
    });
    assert.equal(result.quantity, 1);
  });

  it('rounds a fractional container up', () => {
    const result = chargeableQuantity('sea_fcl', {
      grossWeightKg: 100,
      volumeCbm: 1,
      containerCount: 1.2,
    });
    assert.equal(result.quantity, 2);
  });
});

describe('packaging factor', () => {
  it('inflates both weight and volume, because crating adds both', () => {
    const bare = chargeableQuantity('sea_lcl', {
      grossWeightKg: 1000,
      volumeCbm: 4,
      packagingFactor: 1,
    });
    const packed = chargeableQuantity('sea_lcl', {
      grossWeightKg: 1000,
      volumeCbm: 4,
      packagingFactor: 1.1,
    });
    assert.equal(bare.quantity, 4);
    assert.equal(packed.quantity, 4.4);
  });

  it('treats a missing or zero factor as 1 rather than zeroing the shipment', () => {
    const result = chargeableQuantity('sea_lcl', {
      grossWeightKg: 1000,
      volumeCbm: 4,
      packagingFactor: 0,
    });
    assert.equal(result.quantity, 4);
  });
});

import { describe, expect, it } from 'vitest';
import { molarMass } from '../src/chem/formula';
import { freeLot, newLot } from '../src/chem/lot';
import { SUBSTANCES, solubility } from '../src/data/substances';

describe('substance data', () => {
  it.each(SUBSTANCES.map((s) => [s.id, s]))('%s molar mass matches its formula', (_id, s) => {
    expect(molarMass(s.formula)).toBeCloseTo(s.mw, 1);
  });

  it('solubility interpolates and clamps', () => {
    expect(solubility('salicylic_acid', 'water', 20)).toBeCloseTo(0.22, 6);
    expect(solubility('salicylic_acid', 'water', 30)).toBeCloseTo(0.32, 6);
    expect(solubility('salicylic_acid', 'water', -10)).toBeCloseTo(0.12, 6);
    expect(solubility('salicylic_acid', 'water', 150)).toBeCloseTo(6.7, 6);
    expect(solubility('aspirin', 'hexane', 25)).toBe(0);
  });
});

describe('lots', () => {
  it('converts grams, volume and heat capacity', () => {
    const l = newLot('liquid');
    l.addGrams('water', 50);
    expect(l.volumeML()).toBeCloseTo(50, 6);
    expect(l.heatCapacity()).toBeCloseTo(209, 0);
    const s = newLot('solid');
    s.addGrams('salicylic_acid', 2.0);
    // bulk volume of a loose powder: true volume / packing
    expect(s.volumeML()).toBeCloseTo(2.0 / 1.443 / 0.6, 6);
    freeLot(l);
    freeLot(s);
  });

  it('moving a fraction conserves every component', () => {
    const a = newLot('liquid');
    a.addGrams('water', 10);
    a.addGrams('acetic_acid', 4);
    const b = newLot('liquid');
    a.moveFraction(0.25, b);
    expect(a.grams('water') + b.grams('water')).toBeCloseTo(10, 9);
    expect(b.grams('acetic_acid')).toBeCloseTo(1, 9);
  });

  it('vapour is enriched in the more volatile component', () => {
    const l = newLot('liquid');
    l.addGrams('ethanol', 10);
    l.addGrams('water', 10);
    const v = newLot('gas');
    l.extractVapor(1, 85, v);
    const xEtOH = v.mol('ethanol') / (v.mol('ethanol') + v.mol('water'));
    const xLiq = l.mol('ethanol') / (l.mol('ethanol') + l.mol('water'));
    expect(xEtOH).toBeGreaterThan(xLiq);
    expect(v.volumeML()).toBeCloseTo(1, 6);
  });

  it('non-volatile solutes stay behind when water boils off', () => {
    const l = newLot('liquid');
    l.addGrams('water', 5);
    l.addGrams('aspirin', 1);
    const v = newLot('gas');
    l.extractVapor(2, 100, v);
    expect(v.mol('aspirin')).toBe(0);
    expect(l.grams('aspirin')).toBeCloseTo(1, 9);
  });
});

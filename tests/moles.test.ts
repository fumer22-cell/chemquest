import { describe, expect, it } from 'vitest';
import { Mixture, dilutionVolume, massForSolution, pH, getSubstance } from '../src/chem';

describe('moles, mass and volume', () => {
  it('converts grams to moles through molar mass', () => {
    const m = Mixture.ofMasses({ NaCl: 58.44 });
    expect(m.moles('NaCl')).toBeCloseTo(1.0, 3);
    expect(m.totalMass()).toBeCloseTo(58.44, 6);
  });

  it('water: 100 g is 100 mL and 5.55 mol', () => {
    const m = Mixture.ofMasses({ H2O: 100 });
    expect(m.volumeML()).toBeCloseTo(100, 6);
    expect(m.moles('H2O')).toBeCloseTo(5.551, 3);
  });

  it('undissolved solids displace volume by density, dissolved ones do not', () => {
    const rock = Mixture.ofMasses({ H2O: 50, MnO2: 25.15 });
    expect(rock.volumeML()).toBeCloseTo(55, 1); // 25.15 g / 5.03 g/mL = 5 mL
    const salt = Mixture.ofMasses({ H2O: 100, NaCl: 10 });
    expect(salt.volumeML()).toBeCloseTo(100, 6);
  });

  it('solubility limit leaves excess as solid', () => {
    const m = Mixture.ofMasses({ H2O: 100, NaCl: 50 });
    expect(m.dissolvedMoles('NaCl') * getSubstance('NaCl').molarMass).toBeCloseTo(36, 6);
    expect(m.undissolvedMoles('NaCl') * getSubstance('NaCl').molarMass).toBeCloseTo(14, 6);
  });

  it('taking a volume of solution keeps concentration', () => {
    const stock = Mixture.ofMasses({ H2O: 1000 });
    stock.add('HCl', 6);
    stock.settle(false);
    expect(stock.molarity('HCl')).toBeCloseTo(6, 6);
    const aliquot = stock.takeVolume(41.7);
    expect(aliquot.molarity('HCl')).toBeCloseTo(6, 6);
    expect(aliquot.moles('HCl')).toBeCloseTo(6 * 0.0417, 6);
  });
});

describe('solutions', () => {
  it('dilution: c1V1 = c2V2', () => {
    expect(dilutionVolume(6, 0.5, 500)).toBeCloseTo(41.667, 3);
    const stock = Mixture.of({ H2O: 1000 / 18.015, HCl: 6 });
    const beaker = stock.takeVolume(dilutionVolume(6, 0.5, 500));
    beaker.merge(Mixture.ofMasses({ H2O: 500 - beaker.volumeML() }));
    beaker.settle(false);
    expect(beaker.volumeML()).toBeCloseTo(500, 6);
    expect(beaker.molarity('HCl')).toBeCloseTo(0.5, 6);
  });

  it('mass needed for a solution', () => {
    expect(massForSolution('NaCl', 1.0, 0.25)).toBeCloseTo(14.61, 2);
  });

  it('pH of strong acid, strong base and pure water', () => {
    expect(pH(Mixture.of({ H2O: 55.5 }))).toBeCloseTo(7, 3);
    const acid = Mixture.ofMasses({ H2O: 1000 });
    acid.add('HCl', 0.01);
    acid.settle(false);
    expect(pH(acid)).toBeCloseTo(2, 3);
    const base = Mixture.ofMasses({ H2O: 1000 });
    base.add('NaOH', 0.1);
    base.settle(false);
    expect(pH(base)).toBeCloseTo(13, 3);
  });

  it('dissolving NaOH is exothermic', () => {
    const m = Mixture.ofMasses({ H2O: 100 });
    m.merge(Mixture.ofMasses({ NaOH: 0 }));
    m.add('NaOH', 0.1); // 4 g
    const t0 = m.temperatureK;
    m.settle();
    // 0.1 mol × 44.5 kJ ≈ 4.45 kJ into ~100 g water ≈ +10.6 K
    expect(m.temperatureK - t0).toBeGreaterThan(9);
    expect(m.temperatureK - t0).toBeLessThan(12);
  });
});

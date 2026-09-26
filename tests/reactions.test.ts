import { describe, expect, it } from 'vitest';
import {
  GasTank,
  Mixture,
  allReactions,
  getReaction,
  imbalance,
  maxExtent,
  molesFromPressure,
  pH,
  pressureAtm,
  react,
  boilOff,
} from '../src/chem';

describe('reaction data', () => {
  it('every reaction is balanced', () => {
    for (const r of allReactions()) expect(imbalance(r), r.id).toEqual({});
  });
});

describe('limiting reagent', () => {
  it('H2 + O2: excess oxygen is left over', () => {
    const m = Mixture.of({ H2: 4, O2: 3 });
    const { extent, limiting } = maxExtent(getReaction('h2_combustion'), m);
    expect(limiting).toBe('H2');
    expect(extent).toBeCloseTo(2, 9);
  });

  it('H2 + O2: excess hydrogen is left over', () => {
    const m = Mixture.of({ H2: 5, O2: 1 });
    const [ev] = react(m, { spark: true, extraHeatCapacity: 1e9 });
    expect(ev.limiting).toBe('O2');
    expect(m.moles('H2O')).toBeCloseTo(2, 9);
    expect(m.moles('H2')).toBeCloseTo(3, 9);
    expect(m.moles('O2')).toBe(0);
  });

  it('stoichiometric 2:1 mix leaves nothing', () => {
    const m = Mixture.of({ H2: 2, O2: 1 });
    const [ev] = react(m, { spark: true, extraHeatCapacity: 1e9 });
    expect(ev.excess).toEqual({});
    expect(m.ids()).toEqual(['H2O']);
  });

  it('respects minimum molarity floors', () => {
    const m = Mixture.of({ H2O: 1000 / 18.015, HCl: 6, MnO2: 1 });
    const { extent, limiting } = maxExtent(getReaction('mno2_hcl'), m);
    // only HCl above 3 M can react: (6 - 3) / 4
    expect(extent).toBeCloseTo(0.75, 6);
    expect(limiting).toBe('HCl');
  });
});

describe('reaction outcomes', () => {
  it('no spark → no combustion', () => {
    const m = Mixture.of({ H2: 2, O2: 1 });
    expect(react(m)).toEqual([]);
  });

  it('KClO3 needs the MnO2 catalyst at hot-plate temperatures', () => {
    const plain = Mixture.ofMasses({ KClO3: 122.55 }, 500);
    expect(react(plain)).toEqual([]);

    const cat = Mixture.of({ KClO3: 1, MnO2: 5 / 86.936 }, 500);
    const [ev] = react(cat);
    expect(ev.reaction.id).toBe('kclo3_decomp_cat');
    // 1 mol KClO3 → 1.5 mol O2; catalyst unchanged
    expect(cat.moles('O2')).toBeCloseTo(1.5, 6);
    expect(cat.moles('KCl')).toBeCloseTo(1, 6);
    expect(cat.massOf('MnO2')).toBeCloseTo(5, 3);
    expect(ev.heatJ).toBeGreaterThan(0);
  });

  it('mass is conserved', () => {
    const m = Mixture.ofMasses({ KClO3: 50, MnO2: 2 }, 500);
    const before = m.totalMass();
    react(m);
    expect(m.totalMass()).toBeCloseTo(before, 9);
  });

  it('calcite fizzes in acid: CO2 produced, CaCl2 in solution', () => {
    const m = Mixture.of({ H2O: 100 / 18.015, HCl: 0.3 });
    m.add('CaCO3', 0.1);
    const evs = react(m);
    expect(evs.map((e) => e.reaction.id)).toEqual(['caco3_hcl']);
    expect(evs[0].limiting).toBe('CaCO3');
    expect(evs[0].produced.CO2).toBeCloseTo(0.1, 9);
    expect(m.removeGases().CO2).toBeCloseTo(0.1, 9);
    expect(m.moles('HCl')).toBeCloseTo(0.1, 9);
  });

  it('halite and pyrolusite do not react with cold dilute acid', () => {
    const m = Mixture.of({ H2O: 100 / 18.015, HCl: 0.05, NaCl: 0.1, MnO2: 0.1 });
    expect(react(m)).toEqual([]);
  });

  it('neutralisation gives pH 7 and warms by ~ΔT = q / C', () => {
    const acid = Mixture.of({ H2O: 50 / 18.015, HCl: 0.05 }); // 50 mL of 1.0 M
    const base = Mixture.of({ H2O: 50 / 18.015, NaOH: 0.05 });
    acid.merge(base);
    const t0 = acid.temperatureK;
    const [ev] = react(acid);
    expect(ev.reaction.id).toBe('hcl_naoh');
    expect(pH(acid)).toBeCloseTo(7, 2);
    // ~56 kJ/mol × 0.05 mol = 2.8 kJ into ~100 g water → ≈ +6.6 K
    expect(acid.temperatureK - t0).toBeGreaterThan(6);
    expect(acid.temperatureK - t0).toBeLessThan(7.2);
  });

  it('boiling removes water instead of superheating it', () => {
    const m = Mixture.ofMasses({ H2O: 10 }, 400);
    const lost = boilOff(m);
    expect(lost).toBeGreaterThan(0);
    expect(m.temperatureK).toBeCloseTo(373.15, 6);
  });
});

describe('gas laws', () => {
  it('PV = nRT round trip', () => {
    const n = molesFromPressure(1, 22.414, 273.15);
    expect(n).toBeCloseTo(1, 3);
    expect(pressureAtm(n, 273.15, 22.414)).toBeCloseTo(1, 9);
  });

  it('tank ruptures above rated pressure and loses its contents', () => {
    const tank = new GasTank('O2', 5, 25);
    expect(tank.addGas({ O2: 4 }).ruptured).toBe(false);
    expect(tank.pressureAtm()).toBeCloseTo(4 * 0.082057 * 293.15 / 5, 6);
    const res = tank.addGas({ O2: 2 });
    expect(res.ruptured).toBe(true);
    expect(res.lost.O2).toBeCloseTo(6, 9);
    expect(tank.totalMoles()).toBe(0);
  });

  it("Dalton's law: partial pressures add", () => {
    const tank = new GasTank('mix', 10, 100);
    tank.addGas({ H2: 2, O2: 1 });
    expect(tank.partialPressureAtm('H2') + tank.partialPressureAtm('O2')).toBeCloseTo(tank.pressureAtm(), 9);
    expect(tank.partialPressureAtm('H2') / tank.partialPressureAtm('O2')).toBeCloseTo(2, 9);
  });

  it('valve flow never overshoots equal pressure', () => {
    const a = GasTank.filled('a', 10, 100, 'H2', 40);
    const b = new GasTank('b', 20, 100);
    for (let i = 0; i < 1000; i++) b.addGas(a.flowTo(b, 1, 10).amounts());
    expect(a.pressureAtm()).toBeCloseTo(b.pressureAtm(), 6);
  });
});

import { describe, expect, it } from 'vitest';
import { ChemState, stepKinetics } from '../src/chem/kinetics';
import { newLot, type Lot } from '../src/chem/lot';
import { REACTIONS } from '../src/data/levels/aspirin';

const opts = { reactions: REACTIONS };

/** Hold a mixture at tC for `seconds`. */
function hold(liq: Lot, sol: Lot, st: ChemState, tC: number, seconds: number, dt = 1): void {
  for (let t = 0; t < seconds; t += dt) {
    st.track(tC, dt);
    stepKinetics(liq, sol, tC, dt, st, opts);
  }
}

/** 2.00 g salicylic acid + 5.0 mL acetic anhydride (+ 5 drops of 85 % H3PO4). */
function reactionMixture(catalyst = true) {
  const liq = newLot('liquid');
  const sol = newLot('solid');
  sol.addGrams('salicylic_acid', 2.0);
  liq.addGrams('acetic_anhydride', 5.0 * 1.082);
  if (catalyst) {
    // 5 drops × 0.05 mL × 1.685 g/mL = 0.42 g of 85 % acid
    liq.addGrams('phosphoric_acid', 0.42 * 0.85);
    liq.addGrams('water', 0.42 * 0.15);
  }
  return { liq, sol, st: new ChemState() };
}

const conversion = (l: Lot, s: Lot) => {
  const asa = l.mol('aspirin') + s.mol('aspirin');
  return asa / (2.0 / 138.12);
};

describe('aspirin synthesis kinetics', () => {
  it('standard conditions: 75 °C for 15 min converts > 90 %', () => {
    const { liq, sol, st } = reactionMixture();
    hold(liq, sol, st, 75, 15 * 60);
    expect(conversion(liq, sol)).toBeGreaterThan(0.9);
    // the salicylic acid dissolved on warming
    expect(sol.grams('salicylic_acid')).toBeLessThan(0.01);
    // side product stays small
    expect(liq.grams('assa')).toBeLessThan(0.05);
  });

  it('no catalyst: little reaction', () => {
    const { liq, sol, st } = reactionMixture(false);
    hold(liq, sol, st, 75, 15 * 60);
    expect(conversion(liq, sol)).toBeLessThan(0.25);
  });

  it('no heating: little reaction', () => {
    const { liq, sol, st } = reactionMixture();
    hold(liq, sol, st, 22, 15 * 60);
    expect(conversion(liq, sol)).toBeLessThan(0.3);
  });

  it('overheating at 110 °C makes side products', () => {
    const { liq, sol, st } = reactionMixture();
    hold(liq, sol, st, 110, 15 * 60);
    const side = liq.grams('assa') + liq.grams('tar') + sol.grams('assa') + sol.grams('tar');
    expect(side).toBeGreaterThan(0.1);
  });

  it('quench: 1 mL water destroys the excess anhydride while warm', () => {
    const { liq, sol, st } = reactionMixture();
    hold(liq, sol, st, 75, 15 * 60);
    const before = liq.mol('acetic_anhydride');
    liq.addGrams('water', 1.0);
    hold(liq, sol, st, 80, 120);
    expect(liq.mol('acetic_anhydride')).toBeLessThan(before * 0.25);
  });

  it('without the quench, anhydride survives a cold work-up', () => {
    const { liq, sol, st } = reactionMixture();
    hold(liq, sol, st, 75, 15 * 60);
    liq.addGrams('water', 20);
    hold(liq, sol, st, 3, 10 * 60);
    expect(liq.grams('acetic_anhydride') + sol.grams('acetic_anhydride')).toBeGreaterThan(0.3);
  });

  it('adding cold water and icing crystallises most of the aspirin', () => {
    const { liq, sol, st } = reactionMixture();
    hold(liq, sol, st, 75, 15 * 60);
    liq.addGrams('water', 1.0);
    hold(liq, sol, st, 70, 120);
    liq.addGrams('water', 20);
    // cool slowly to room temperature, then ice
    for (let t = 70; t > 22; t -= 1) hold(liq, sol, st, t, 15);
    hold(liq, sol, st, 2, 10 * 60);
    expect(sol.grams('aspirin')).toBeGreaterThan(2.0); // theoretical 2.61 g; crude yields ~80–90 %
  });

  it('crystallising fast traps more salicylic acid than crystallising slowly', () => {
    const run = (ratePerMin: number) => {
      const liq = newLot('liquid');
      const sol = newLot('solid');
      liq.addGrams('water', 20);
      liq.addGrams('ethanol', 3);
      liq.addGrams('aspirin', 2.0);
      liq.addGrams('salicylic_acid', 0.1);
      const st = new ChemState();
      for (let t = 75; t > 2; t -= ratePerMin / 60) {
        st.track(t, 1);
        stepKinetics(liq, sol, t, 1, st, opts);
      }
      hold(liq, sol, st, 2, 300);
      return sol.grams('salicylic_acid') / sol.totalGrams();
    };
    expect(run(40)).toBeGreaterThan(run(3) * 1.5);
  });

  it('ferric chloride turns violet with salicylic acid but not with aspirin', () => {
    const test = (solute: string) => {
      const liq = newLot('liquid');
      const sol = newLot('solid');
      liq.addGrams('water', 1);
      sol.addGrams(solute, 0.02);
      liq.addGrams('ferric_chloride', 0.0005);
      hold(liq, sol, new ChemState(), 22, 60);
      return liq.mol('iron_salicylate');
    };
    expect(test('salicylic_acid')).toBeGreaterThan(1e-6);
    expect(test('aspirin')).toBeLessThan(1e-7); // only trace hydrolysis
  });

  it('a little liquid on crystals soaks in as a wet cake, and dries in air', () => {
    const liq = newLot('liquid');
    const sol = newLot('solid');
    sol.addGrams('aspirin', 2);
    liq.addGrams('water', 0.5);
    const st = new ChemState();
    hold(liq, sol, st, 22, 1);
    expect(liq.isEmpty()).toBe(true);
    expect(sol.grams('water')).toBeCloseTo(0.5, 2);
    hold(liq, sol, st, 22, 30 * 60);
    expect(sol.grams('water')).toBeLessThan(0.05);
  });
});

describe('adding liquid drop by drop', () => {
  it('a growing pool of liquid on crystals turns into a slurry, not a wet cake', () => {
    const liq = newLot('liquid');
    const sol = newLot('solid');
    sol.addGrams('salicylic_acid', 2);
    const st = new ChemState();
    for (let i = 0; i < 110; i++) {
      liq.addGrams('acetic_anhydride', 0.05 * 1.082); // one 0.05 mL drop per step
      hold(liq, sol, st, 22, 0.25, 0.25);
    }
    expect(sol.grams('acetic_anhydride')).toBe(0);
    expect(liq.grams('acetic_anhydride')).toBeGreaterThan(5);
  });
});

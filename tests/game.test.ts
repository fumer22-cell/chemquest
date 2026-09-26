import { describe, expect, it } from 'vitest';
import { Mixture, pH } from '../src/chem';
import { MINERALS } from '../src/data/minerals';
import { ORDERS } from '../src/data/orders';
import { GameState } from '../src/game/state';
import { gradeDelivery } from '../src/game/orders';

const mineral = (id: string) => MINERALS.find((m) => m.id === id)!;
const stock = (id: string) => ({ kind: 'stock' as const, id });

/** Pour until the balance (tared) reads at least `grams`. */
function pourByBalance(g: GameState, from: ReturnType<typeof stock>, to: string, grams: number) {
  g.lab.setOnScale(to);
  g.lab.tare();
  let guard = 0;
  while (parseFloat(g.lab.balanceReading()) < grams && guard++ < 100000) g.lab.pour(from, to, 1 / 60, true);
}

function harvest(g: GameState, id: string, times: number) {
  for (let i = 0; i < times; i++) {
    g.harvest(mineral(id));
    g.time += 2;
  }
}

describe('order grading', () => {
  const order = ORDERS.find((o) => o.id === 'hcl_05')!;
  it('pays in full within 5%', () => {
    const m = Mixture.of({ H2O: 500 / 18.015, HCl: 0.25 });
    expect(gradeDelivery(order, m).result).toBe('full');
  });
  it('half pay within 15%', () => {
    const m = Mixture.of({ H2O: 500 / 18.015, HCl: 0.22 });
    expect(gradeDelivery(order, m).result).toBe('partial');
  });
  it('rejects wrong concentration and contamination', () => {
    expect(gradeDelivery(order, Mixture.of({ H2O: 500 / 18.015, HCl: 0.1 })).result).toBe('rejected');
    const dirty = Mixture.of({ H2O: 500 / 18.015, HCl: 0.25, NaCl: 0.05 });
    expect(gradeDelivery(order, dirty).result).toBe('rejected');
  });
});

describe('mineral identification', () => {
  it('flame + acid identifies calcite, and hides the equation until then', () => {
    const g = new GameState();
    harvest(g, 'A', 1);
    // acid test first: HCl into a tube with some sample A
    const tubeFrom = stock('mineral:A');
    for (let i = 0; i < 30; i++) g.lab.pour(tubeFrom, 'tube', 1 / 60, false); // ~2.5 g
    for (let i = 0; i < 60; i++) g.lab.pour(stock('hcl6'), 'tube', 1 / 60, false); // ~15 mL
    expect(g.journal.samples.get('A')!.tests.acid).toMatch(/fizz/i);
    expect(g.journal.reactions.has('caco3_hcl')).toBe(false); // still unidentified
    expect(g.journal.samples.get('A')!.identified).toBe(false);
    g.lab.flameTest(tubeFrom);
    expect(g.journal.samples.get('A')!.tests.flame).toMatch(/brick red/);
    expect(g.journal.samples.get('A')!.identified).toBe(true);
    expect(g.journal.reactions.has('caco3_hcl')).toBe(true);
    expect(g.journal.displayName('CaCO3')).toMatch(/calcium carbonate/);
  });

  it('pyrolusite: no flame colour, no reaction with dilute acid', () => {
    const g = new GameState();
    harvest(g, 'C', 1);
    g.lab.flameTest(stock('mineral:C'));
    for (let i = 0; i < 20; i++) g.lab.pour(stock('mineral:C'), 'tube', 1 / 60, false);
    for (let i = 0; i < 40; i++) g.lab.pour(stock('hcl6'), 'tube', 1 / 60, false);
    for (let i = 0; i < 20; i++) g.lab.pour(stock('water'), 'tube', 1 / 60, false); // dilute
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    const s = g.journal.samples.get('C')!;
    expect(s.tests.flame).toMatch(/no characteristic/);
    expect(s.tests.acid).toMatch(/No visible reaction/);
    expect(s.identified).toBe(true);
  });
});

describe('oxygen from KClO3', () => {
  it('without catalyst the hot plate cannot release oxygen', () => {
    const g = new GameState();
    pourByBalance(g, stock('kclo3'), 'flask', 50);
    g.lab.burner = { vesselId: 'flask', on: true };
    for (let i = 0; i < 60 * 120; i++) g.update(1 / 60);
    expect(g.lab.o2Tank.totalMoles()).toBe(0);
    expect(g.lab.vessel('flask').contents.temperatureK).toBeLessThan(700);
  });

  it('with MnO2 the flask fills the O2 tank; 122.5 g gives 1.5 mol', () => {
    const g = new GameState();
    harvest(g, 'C', 1);
    pourByBalance(g, stock('kclo3'), 'flask', 122.5);
    g.lab.tare();
    pourByBalance(g, stock('mineral:C'), 'flask', 3);
    g.lab.burner = { vesselId: 'flask', on: true };
    for (let i = 0; i < 60 * 60; i++) g.update(1 / 60);
    expect(g.lab.o2Tank.contents.moles('O2')).toBeCloseTo(1.5, 1);
    expect(g.journal.reactions.has('kclo3_decomp_cat')).toBe(true);
    const before = g.lifeSupport.o2Mol;
    for (let i = 0; i < 60 * 30; i++) g.lab.feedLifeSupport(1 / 60);
    expect(g.lifeSupport.o2Mol - before).toBeCloseTo(1.5, 1);
  });

  it('overfilling the O2 tank ruptures it', () => {
    const g = new GameState();
    harvest(g, 'C', 1);
    g.lab.o2Tank.addGas({ O2: 4.5 });
    pourByBalance(g, stock('kclo3'), 'flask', 100);
    pourByBalance(g, stock('mineral:C'), 'flask', 2);
    g.lab.burner = { vesselId: 'flask', on: true };
    for (let i = 0; i < 60 * 60; i++) g.update(1 / 60);
    expect(g.lab.o2Tank.totalMoles()).toBe(0);
    expect(g.log.some((l) => /burst/.test(l.text))).toBe(true);
  });
});

describe('recombiner', () => {
  function fill(g: GameState, which: 'h2' | 'o2', targetAtm: number) {
    while (g.lab.chamber.pressureAtm() < targetAtm) g.lab.valve(which, 1 / 60, true);
  }

  it('2:1 by pressure (same chamber) wastes nothing', () => {
    const g = new GameState();
    g.lab.o2Tank.addGas({ O2: 4 });
    fill(g, 'h2', 2.0);
    fill(g, 'o2', 3.0);
    const w0 = g.lifeSupport.waterML;
    g.lab.ignite();
    // 3 atm in 20 L at 293 K ≈ 2.49 mol gas → 1.66 mol H2O ≈ 30 mL
    expect(g.lifeSupport.waterML - w0).toBeGreaterThan(29);
    expect(g.log.some((l) => /purged and lost/.test(l.text))).toBe(false);
  });

  it('wrong ratio: excess is purged', () => {
    const g = new GameState();
    g.lab.o2Tank.addGas({ O2: 4 });
    fill(g, 'h2', 1.5);
    fill(g, 'o2', 3.0);
    g.lab.ignite();
    expect(g.log.some((l) => /Unburnt O2 was purged/.test(l.text))).toBe(true);
  });

  it('igniting above the limit wrecks the chamber', () => {
    const g = new GameState();
    g.lab.o2Tank.addGas({ O2: 5 });
    fill(g, 'h2', 4);
    fill(g, 'o2', 6);
    const w0 = g.lifeSupport.waterML;
    g.lab.ignite();
    expect(g.lifeSupport.waterML).toBe(w0);
    expect(g.lab.recombinerRepairS).toBeGreaterThan(0);
  });
});

describe('solution orders end to end', () => {
  it('neutralising NaOH with HCl warms the beaker and reads pH 7', () => {
    const g = new GameState();
    for (let i = 0; i < 60 * 4; i++) g.lab.pour(stock('water'), 'beaker', 1 / 60, false); // 60 mL
    pourByBalance(g, stock('naoh'), 'beaker', 2.0);
    const n = g.lab.vessel('beaker').contents.moles('NaOH');
    // add stoichiometric acid via a precise transfer
    const acid = g.lab.stocks.get('hcl6')!.contents.takeVolume((n / 6) * 1000);
    g.lab.vessel('beaker').contents.merge(acid);
    const t0 = g.lab.vessel('beaker').contents.temperatureK;
    g.lab.processVessel(g.lab.vessel('beaker'));
    expect(g.lab.vessel('beaker').contents.temperatureK).toBeGreaterThan(t0);
    expect(pH(g.lab.vessel('beaker').contents)).toBeCloseTo(7, 1);
  });

  it('1.00 M NaCl from halite sells for full price', () => {
    const g = new GameState();
    harvest(g, 'B', 1);
    pourByBalance(g, stock('mineral:B'), 'beaker', 14.6);
    g.lab.setOnScale('beaker');
    g.lab.tare();
    while (parseFloat(g.lab.balanceReading()) < 250) g.lab.pour(stock('water'), 'beaker', 1 / 60, true);
    g.lab.bottle('beaker');
    const grade = g.deliver('nacl_1', g.products[0].id)!;
    expect(grade.result).toBe('full');
    expect(g.credits).toBe(50);
    expect(g.buy('precision_balance')).toMatch(/need/);
  });
});

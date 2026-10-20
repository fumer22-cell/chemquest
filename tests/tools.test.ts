import { describe, expect, it } from 'vitest';
import { newLot } from '../src/chem/lot';
import { GLASSWARE } from '../src/data/glassware';
import { Container } from '../src/sim/container';
import { Tool } from '../src/sim/tools';
import { World } from '../src/sim/world';

function setup() {
  const w = new World();
  const wg = w.add(new Container(GLASSWARE.watchGlass, 60, 150));
  const s = newLot('solid');
  s.addGrams('aspirin', 1.0);
  wg.fill(s, 'solid');
  const tt = w.add(new Container(GLASSWARE.testTube, 140, 140));
  for (let t = 0; t < 120; t++) w.update(0.25);
  return { w, wg, tt };
}

/** Put the tool's tip on a world point. */
const aim = (t: Tool, x: number, y: number) => {
  t.x = x;
  t.y = y - t.length;
};

describe('spatula', () => {
  it('scoops a pinch of crystals and tips it into a test tube', () => {
    const { w, wg, tt } = setup();
    const sp = new Tool('spatula', 0, 0);
    w.tools.push(sp);
    aim(sp, wg.x, wg.bottomY - 3);
    expect(sp.act(w, true)).toBe('fill');
    expect(sp.lot!.totalGrams()).toBeCloseTo(0.02, 3);
    aim(sp, tt.x, tt.bottomY - tt.shape.h - 1);
    expect(sp.act(w)).toBe('drop');
    for (let t = 0; t < 60; t++) w.update(0.25);
    expect(tt.solid.grams('aspirin')).toBeCloseTo(0.02, 3);
    expect(wg.solid.grams('aspirin')).toBeCloseTo(0.98, 3);
  });

  it('a full scoop moves 0.6 g', () => {
    const { w, wg } = setup();
    const sp = new Tool('spatula', 0, 0);
    aim(sp, wg.x, wg.bottomY - 3);
    sp.act(w);
    expect(sp.lot!.totalGrams()).toBeCloseTo(0.6, 3);
  });
});

describe('pipette', () => {
  it('fills from a liquid and releases 0.05 mL drops', () => {
    const w = new World();
    const b = w.add(new Container(GLASSWARE.beaker50, 60, 120));
    const l = newLot('liquid');
    l.addGrams('water', 20);
    b.fill(l, 'liquid');
    const tt = w.add(new Container(GLASSWARE.testTube, 140, 140));
    for (let t = 0; t < 60; t++) w.update(0.25);
    const p = new Tool('pipette', 0, 0);
    aim(p, b.x, b.bottomY - 4);
    expect(p.act(w)).toBe('fill');
    expect(p.volumeML()).toBeCloseTo(1.5, 6);
    aim(p, tt.x, tt.bottomY - tt.shape.h - 1);
    for (let i = 0; i < 5; i++) {
      expect(p.act(w)).toBe('drop');
      for (let t = 0; t < 10; t++) w.update(0.25);
    }
    for (let t = 0; t < 60; t++) w.update(0.25);
    expect(tt.liquid.grams('water')).toBeCloseTo(0.25, 3);
  });
});

describe('cleaning up spills', () => {
  it('the spatula scrapes spilled crystals off the bench', () => {
    const w = new World();
    // Spill 0.3 g of crystals onto the bench as loose grains.
    for (let n = 0; n < 12; n++) {
      const grain = newLot('solid');
      grain.addGrams('salicylic_acid', 0.025);
      w.grid.put((w.benchY - 1) * 320 + 100 + n, 3, grain.id, 22);
    }
    const sp = new Tool('spatula', 0, 0);
    aim(sp, 105, w.benchY - 2);
    expect(sp.act(w)).toBe('fill');
    expect(sp.lot!.grams('salicylic_acid')).toBeGreaterThan(0.2);
  });

  it('the pipette sucks up a spilled puddle', () => {
    const w = new World();
    for (let n = 0; n < 10; n++) {
      const drop = newLot('liquid');
      drop.addGrams('water', 0.05);
      w.grid.put((w.benchY - 1) * 320 + 60 + n, 4, drop.id, 22);
    }
    const p = new Tool('pipette', 0, 0);
    aim(p, 63, w.benchY - 2);
    expect(p.act(w)).toBe('fill');
    expect(p.volumeML()).toBeGreaterThan(0.25);
  });
});

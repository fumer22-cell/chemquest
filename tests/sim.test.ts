import { describe, expect, it } from 'vitest';
import { VOL_PER_PX } from '../src/config';
import { getLot, newLot } from '../src/chem/lot';
import { GLASSWARE } from '../src/data/glassware';
import { Container } from '../src/sim/container';
import { K } from '../src/sim/grid';
import { World } from '../src/sim/world';

/** Grams of water anywhere: containers, the air/bench, or recorded as lost. */
function totalWater(w: World): number {
  let g = 0;
  for (const c of w.containers) {
    g += c.liquid.grams('water') + c.solid.grams('water');
    const { kind, lot } = c.grid;
    for (let i = 0; i < kind.length; i++) if (kind[i] === K.Gas) g += getLot(lot[i]).grams('water');
  }
  const { kind, lot } = w.grid;
  for (let i = 0; i < kind.length; i++) {
    if (kind[i] === K.Liquid || kind[i] === K.Powder || kind[i] === K.Gas) g += getLot(lot[i]).grams('water');
  }
  return g + w.losses.vapourG + w.losses.spilledML; // water: 1 g/mL
}

function waterBeaker(w: World, x: number, grams: number): Container {
  const c = w.add(new Container(GLASSWARE.beaker50, x, 120));
  const l = newLot('liquid');
  l.addGrams('water', grams);
  c.fill(l, 'liquid');
  return c;
}

describe('containers', () => {
  it('fill draws one pixel per 0.05 mL', () => {
    const w = new World();
    const c = waterBeaker(w, 60, 20);
    expect(c.liquid.px).toBe(Math.round(20 / VOL_PER_PX));
  });

  it('liquid settles to the bottom', () => {
    const w = new World();
    const c = waterBeaker(w, 60, 10);
    for (let t = 0; t < 200; t++) w.update(0.25);
    const { kind, w: gw, h } = c.grid;
    let low = 0;
    for (let i = 0; i < kind.length; i++) if (kind[i] === K.Liquid && Math.floor(i / gw) > h - 12) low++;
    expect(low / c.liquid.px).toBeGreaterThan(0.95);
  });
});

describe('pouring', () => {
  it('tilting pours into the container below and conserves mass', () => {
    const w = new World();
    const src = waterBeaker(w, 60, 20);
    const dst = w.add(new Container(GLASSWARE.beaker100, 140, 120));
    for (let t = 0; t < 30; t++) w.update(0.25);
    const before = totalWater(w);
    // Hold the source above and to the left of the target and tilt toward it.
    src.held = true;
    src.x = 112;
    src.y = 60;
    src.angle = 1.6;
    for (let t = 0; t < 900; t++) w.update(0.25);
    expect(dst.liquid.grams('water')).toBeGreaterThan(15);
    expect(totalWater(w)).toBeCloseTo(before, 6);
  });
});

describe('heating', () => {
  it('a hot plate heats, boils, and the vapour is accounted for', () => {
    const w = new World();
    const hp = w.equip({ id: 'hp', kind: 'hotplate', label: 'hp', x: 40, y: 150, w: 48, h: 14, setpoint: 300, on: true });
    const c = waterBeaker(w, 64, 10);
    const before = totalWater(w);
    for (let t = 0; t < 3000 && c.liquid.grams('water') > 7; t++) w.update(0.25);
    expect(hp.temp).toBeGreaterThan(250);
    expect(c.tempC).toBeGreaterThan(95);
    expect(c.tempC).toBeLessThan(106);
    expect(c.liquid.grams('water')).toBeLessThan(9);
    expect(totalWater(w)).toBeCloseTo(before, 6);
  });

  it('an ice bath cools warm water', () => {
    const w = new World();
    w.equip({ id: 'ice', kind: 'bath', label: 'ice', x: 30, y: 110, w: 60, h: 50, levelY: 118, temp: 1, setpoint: 1, fixedTemp: true });
    const c = waterBeaker(w, 60, 10);
    c.addHeat(10 * 4.18 * 40); // warm it by ~40 °C
    for (let t = 0; t < 2400; t++) w.update(0.25);
    expect(c.restOn).toBe('ice');
    expect(c.tempC).toBeLessThan(10);
  });
});

import { describe, expect, it } from 'vitest';
import { newLot } from '../src/chem/lot';
import { GLASSWARE } from '../src/data/glassware';
import { controlAt, equipmentControls } from '../src/sim/controls';
import { Container } from '../src/sim/container';
import { World } from '../src/sim/world';

describe('equipment buttons', () => {
  it('TARE on the balance zeroes it with the flask on the pan', () => {
    const w = new World();
    const bal = w.equip({ id: 'balance', kind: 'balance', label: 'b', x: 78, y: 152, w: 34, h: 12, tare: 0 });
    const f = w.add(new Container(GLASSWARE.beaker50, 95, 100));
    for (let t = 0; t < 120; t++) w.update(0.25);
    expect(f.restOn).toBe('balance');
    const tare = equipmentControls(w).controls.find((c) => c.id === 'balance:tare')!;
    expect(controlAt(w, tare.x + 1, tare.y + 1)?.id).toBe(tare.id);
    tare.act(w, false);
    expect(bal.tare).toBeCloseTo(f.grossMass(), 6);
    const l = newLot('solid');
    l.addGrams('salicylic_acid', 2);
    f.fill(l, 'solid');
    expect(f.grossMass() - bal.tare!).toBeCloseTo(2, 6);
  });

  it('bath − / + / ON change the setpoint and heater', () => {
    const w = new World();
    const bath = w.equip({ id: 'bath', kind: 'bath', label: 'b', x: 168, y: 128, w: 56, h: 36, levelY: 138, setpoint: 75 });
    const get = (id: string) => equipmentControls(w).controls.find((c) => c.id === `bath:${id}`)!;
    get('up').act(w, false);
    expect(bath.setpoint).toBe(80);
    get('down').act(w, true);
    expect(bath.setpoint).toBe(79);
    get('power').act(w, false);
    expect(bath.on).toBe(true);
  });
});

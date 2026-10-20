import type { Equipment, World } from './world';

/** A clickable button drawn on a piece of equipment (world pixels). */
export interface Control {
  id: string;
  eq: Equipment;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Text on the key. */
  text: string;
  /** Lit up (e.g. heater on). */
  lit?: boolean;
  /** Tooltip. */
  hint: string;
  act: (world: World, fine: boolean) => void;
}

/** Read-only pixel display drawn next to controls. */
export interface Display {
  x: number;
  y: number;
  w: number;
  text: string;
  color: [number, number, number];
}

const STRIP_Y = 166;
const KEY_H = 9;
const keyW = (t: string) => t.length * 4 + 3;

/** Every control on every piece of equipment, positioned in world pixels. */
export function equipmentControls(world: World): { controls: Control[]; displays: Display[] } {
  const controls: Control[] = [];
  const displays: Display[] = [];
  for (const e of world.equipment) {
    if (e.kind === 'balance') {
      const t = 'TARE';
      controls.push({
        id: `${e.id}:tare`,
        eq: e,
        x: e.x + Math.round((e.w - keyW(t)) / 2),
        y: STRIP_Y,
        w: keyW(t),
        h: KEY_H,
        text: t,
        hint: 'Tare: zero the balance with what is on it now',
        act: (w) => {
          const on = w.containers.find((c) => c.restOn === e.id && !c.held);
          e.tare = on ? on.grossMass() : 0;
        },
      });
    } else if ((e.kind === 'bath' && !e.fixedTemp) || e.kind === 'hotplate') {
      const isBath = e.kind === 'bath';
      const [lo, hi, step] = isBath ? [25, 99, 5] : [30, 350, 10];
      const nudge = (d: number) => (e.setpoint = Math.min(hi, Math.max(lo, e.setpoint + d)));
      let x = e.x + 1;
      controls.push({
        id: `${e.id}:down`, eq: e, x, y: STRIP_Y, w: 7, h: KEY_H, text: '-',
        hint: `Lower the setpoint by ${step} °C (Shift: 1 °C)`,
        act: (_w, fine) => nudge(fine ? -1 : -step),
      });
      x += 8;
      const set = `${Math.round(e.setpoint)}°`;
      displays.push({ x, y: STRIP_Y, w: 18, text: set, color: e.on ? [255, 150, 70] : [150, 120, 100] });
      x += 19;
      controls.push({
        id: `${e.id}:up`, eq: e, x, y: STRIP_Y, w: 7, h: KEY_H, text: '+',
        hint: `Raise the setpoint by ${step} °C (Shift: 1 °C)`,
        act: (_w, fine) => nudge(fine ? 1 : step),
      });
      x += 8;
      const t = e.on ? 'ON' : 'OFF';
      controls.push({
        id: `${e.id}:power`, eq: e, x, y: STRIP_Y, w: keyW('OFF'), h: KEY_H, text: t, lit: e.on,
        hint: `${isBath ? 'Water bath' : 'Hot plate'} heater on/off`,
        act: () => (e.on = !e.on),
      });
    } else if (e.kind === 'stand') {
      controls.push({
        id: `${e.id}:vac`, eq: e, x: e.x + 4, y: STRIP_Y, w: keyW('VAC'), h: KEY_H, text: 'VAC', lit: e.on,
        hint: e.on ? 'Vacuum is on: click to turn it off' : 'Turn the vacuum on (pulls liquid through the filter)',
        act: () => (e.on = !e.on),
      });
    } else if (e.kind === 'mp') {
      controls.push({
        id: `${e.id}:run`, eq: e, x: e.x + e.w - keyW('RUN') - 2, y: e.y + e.h - KEY_H - 1, w: keyW('RUN'), h: KEY_H, text: 'RUN',
        hint: 'Run a melting-point measurement on the sample on the apparatus',
        act: (w) => w.onAction('mp', e),
      });
    }
  }
  return { controls, displays };
}

export function controlAt(world: World, x: number, y: number): Control | null {
  for (const c of equipmentControls(world).controls) {
    if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) return c;
  }
  return null;
}

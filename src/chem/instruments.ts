/**
 * Instruments convert the hidden true state into what the player can read.
 * Each has a resolution; readings are rounded to it (and never reveal moles).
 */
import { toCelsius } from './thermal';

export const roundTo = (x: number, step: number) => Math.round(x / step) * step;

const decimals = (step: number) => Math.max(0, -Math.floor(Math.log10(step) + 1e-9));

export interface Balance {
  /** g per division. */
  resolution: number;
  capacityG: number;
}

/** Balance display, e.g. "123.4 g". Shows "OVER" above capacity. */
export function readBalance(massG: number, b: Balance): string {
  if (massG > b.capacityG) return 'OVER';
  const v = roundTo(massG, b.resolution);
  return `${(Object.is(v, -0) ? 0 : v).toFixed(decimals(b.resolution))} g`;
}

export type Glassware = 'cylinder' | 'beaker' | 'tube' | 'flask';

/** Graduation spacing (mL) for each kind of glassware. */
export const GRADUATION: Record<Glassware, number> = {
  cylinder: 0.5, // 100 mL graduated cylinder: read to ±0.5 mL
  beaker: 25, // beaker marks are rough
  tube: 5,
  flask: 50,
};

export function readVolume(volumeML: number, kind: Glassware): string {
  const step = GRADUATION[kind];
  const v = roundTo(volumeML, step);
  const approx = kind === 'cylinder' ? '' : '≈ ';
  return `${approx}${v.toFixed(decimals(step))} mL`;
}

export function readThermometer(temperatureK: number): string {
  return `${roundTo(toCelsius(temperatureK), 0.5).toFixed(1)} °C`;
}

export function readPressure(atm: number): string {
  return `${roundTo(atm, 0.1).toFixed(1)} atm`;
}

export function readPHMeter(pH: number | null): string {
  return pH === null ? '--.--' : roundTo(pH, 0.01).toFixed(2);
}

/** Universal indicator paper: whole-number pH and a colour. */
export function readPHPaper(pH: number | null): { value: string; color: number } {
  if (pH === null) return { value: 'dry', color: 0xd8c9a0 };
  const p = Math.min(14, Math.max(0, Math.round(pH)));
  const colors = [
    0xd7191c, 0xe8412a, 0xf0662f, 0xf99d3a, 0xfdc84d, 0xf5e663, 0xc7e36a, 0x7ec75b,
    0x3fae5a, 0x2c9f8c, 0x2a7fb8, 0x3160b0, 0x3b4ba5, 0x4a3593, 0x55217f,
  ];
  return { value: `~${p}`, color: colors[p] };
}

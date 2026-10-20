import { substance } from '../data/substances';
import type { Container } from '../sim/container';

/** What the glassware's graduations let you read. */
export function volumeReading(c: Container): string {
  const v = c.contentsML();
  if (v < 0.02) return 'empty';
  const step = c.def.gradStep;
  switch (c.def.reading) {
    case 'cylinder':
      // Read to half a division.
      return `${(Math.round(v / (step / 2)) * (step / 2)).toFixed(step < 1 ? 1 : 0)} mL`;
    case 'beaker':
    case 'flask':
      return v < step ? `< ${step} mL` : `≈ ${Math.round(v / step) * step} mL`;
    case 'tube':
      return `≈ ${Math.max(1, Math.round(v))} mL`;
    default:
      return v < 1 ? 'a little' : 'some';
  }
}

/** Thermometer reading (to 0.5 °C). */
export function tempReading(tC: number): string {
  return `${(Math.round(tC * 2) / 2).toFixed(1)} °C`;
}

/** Sandbox-only: exact composition. */
export function composition(c: Container): string {
  const rows: string[] = [];
  for (const [label, lot] of [
    ['liquid', c.liquid],
    ['solid', c.solid],
  ] as const) {
    for (const id of lot.ids()) {
      const g = lot.grams(id);
      if (g < 0.0005) continue;
      rows.push(`${label === 'solid' ? '▪' : '~'} ${substance(id).name}: ${g < 0.1 ? g.toFixed(3) : g.toFixed(2)} g`);
    }
  }
  return rows.join('\n');
}

import { getElement } from './elements';
import type { Mixture } from './mixture';
import { getSubstance } from './registry';

export interface FlameResult {
  color: string | null;
  description: string;
}

/**
 * Flame test: the colour comes from metal ions in the sample. The element with the
 * most atoms present dominates (sodium famously masks everything else).
 */
export function flameTest(mix: Mixture): FlameResult {
  const weights = new Map<string, number>();
  for (const id of mix.ids()) {
    const s = getSubstance(id);
    for (const [el, count] of Object.entries(s.composition)) {
      const e = getElement(el);
      if (!e.flame) continue;
      // Sodium's emission is far more intense than the others.
      const intensity = el === 'Na' ? 20 : 1;
      weights.set(el, (weights.get(el) ?? 0) + mix.moles(id) * count * intensity);
    }
  }
  let best: string | null = null;
  let bw = 0;
  for (const [el, w] of weights) if (w > bw) (best = el), (bw = w);
  if (!best) {
    return { color: null, description: 'no characteristic colour; the sample just glows orange-hot' };
  }
  const f = getElement(best).flame!;
  return { color: f.color, description: `${f.description} flame` };
}

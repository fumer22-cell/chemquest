import { EPS, KW } from './constants';
import type { Mixture } from './mixture';
import { getSubstance } from './registry';

/** c1·V1 = c2·V2 → V1 (same units as V2). */
export function dilutionVolume(c1: number, c2: number, v2: number): number {
  return (c2 * v2) / c1;
}

/** Grams of solute needed for `volumeL` of `molarity` M solution. */
export function massForSolution(substanceId: string, molarity: number, volumeL: number): number {
  return molarity * volumeL * getSubstance(substanceId).molarMass;
}

/**
 * pH for mixtures of strong acids and bases (complete dissociation), including
 * water autoionisation so neutral water reads 7.00. Returns null with no water.
 */
export function pH(mix: Mixture): number | null {
  const vL = mix.liquidVolumeML() / 1000;
  if (vL <= EPS) return null;
  let h = 0;
  let oh = 0;
  for (const id of mix.ids()) {
    const s = getSubstance(id);
    const d = mix.dissolvedMoles(id);
    if (s.acidProtons) h += d * s.acidProtons;
    if (s.baseHydroxides) oh += d * s.baseHydroxides;
  }
  const net = (h - oh) / vL; // mol/L of excess strong acid (negative = excess base)
  // [H+] - Kw/[H+] = net  →  [H+] = (net + sqrt(net² + 4Kw)) / 2
  let hPlus: number;
  if (net >= 0) hPlus = (net + Math.sqrt(net * net + 4 * KW)) / 2;
  else {
    const b = -net;
    const ohMinus = (b + Math.sqrt(b * b + 4 * KW)) / 2;
    hPlus = KW / ohMinus;
  }
  return -Math.log10(hPlus);
}

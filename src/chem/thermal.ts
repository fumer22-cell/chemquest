import { AMBIENT_K, EPS, WATER_BP_K, WATER_HVAP } from './constants';
import type { Mixture } from './mixture';

/**
 * If water is above its boiling point, turn the excess heat into vaporised
 * water (lost as steam). Returns moles of water boiled off.
 */
export function boilOff(mix: Mixture, extraC = 0): number {
  const water = mix.waterMoles();
  if (water <= EPS || mix.temperatureK <= WATER_BP_K) return 0;
  const c = mix.heatCapacity() + extraC;
  const excessJ = (mix.temperatureK - WATER_BP_K) * c;
  const vap = Math.min(water, excessJ / WATER_HVAP);
  mix.remove('H2O', vap);
  const leftJ = excessJ - vap * WATER_HVAP;
  mix.temperatureK = WATER_BP_K;
  mix.addHeat(leftJ, extraC);
  return vap;
}

/** Newton cooling toward ambient over dt seconds. h = heat-loss coefficient in W/K. */
export function relax(mix: Mixture, dt: number, h: number, extraC = 0, ambientK = AMBIENT_K): void {
  const c = mix.heatCapacity() + extraC;
  if (c <= EPS) {
    mix.temperatureK = ambientK;
    return;
  }
  mix.temperatureK = ambientK + (mix.temperatureK - ambientK) * Math.exp((-h * dt) / c);
}

export const toCelsius = (k: number) => k - 273.15;

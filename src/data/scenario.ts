/**
 * Starting conditions for the first milestone. Tuning lives here.
 */
import type { Glassware } from '../chem/instruments';

export interface StockDef {
  id: string;
  label: string;
  /** Initial contents in moles. */
  amountsMol: Record<string, number>;
  /** Name is known from the bottle label (journal records it at start). */
  known: boolean;
}

const WATER_MOL_PER_ML = 1 / 18.015;

export const STOCKS: StockDef[] = [
  { id: 'hcl6', label: 'Hydrochloric acid 6.0 M', amountsMol: { HCl: 6.0, H2O: 1000 * WATER_MOL_PER_ML }, known: true },
  { id: 'naoh', label: 'NaOH pellets', amountsMol: { NaOH: 200 / 39.997 }, known: true },
  { id: 'kclo3', label: 'KClO₃ (potassium chlorate)', amountsMol: { KClO3: 1000 / 122.548 }, known: true },
  { id: 'water', label: 'Distilled water', amountsMol: { H2O: 3000 * WATER_MOL_PER_ML }, known: true },
];

export interface VesselDef {
  id: string;
  name: string;
  kind: Glassware;
  capacityML: number;
  /** Empty glass mass, g (the balance sees this unless tared). */
  glassMassG: number;
  /** J/K of the glass itself. */
  heatCapacity: number;
  /** Gases produced inside are piped to this tank instead of escaping. */
  gasOutlet?: 'o2';
}

export const VESSELS: VesselDef[] = [
  { id: 'beaker', name: 'Beaker 600 mL', kind: 'beaker', capacityML: 600, glassMassG: 182.4, heatCapacity: 150 },
  { id: 'cylinder', name: 'Graduated cylinder 100 mL', kind: 'cylinder', capacityML: 100, glassMassG: 96.7, heatCapacity: 80 },
  { id: 'tube', name: 'Test tube', kind: 'tube', capacityML: 25, glassMassG: 17.9, heatCapacity: 15 },
  { id: 'flask', name: 'Reaction flask', kind: 'flask', capacityML: 250, glassMassG: 121.3, heatCapacity: 60, gasOutlet: 'o2' },
];

export const TANKS = {
  h2: { name: 'H₂ tank (salvaged fuel)', volumeL: 10, ratedAtm: 50, startAtm: 40 },
  o2: { name: 'O₂ tank', volumeL: 5, ratedAtm: 25 },
  chamber: { name: 'Recombiner chamber', volumeL: 20, ratedAtm: 5 },
};

export const LAB = {
  balanceCapacityG: 1000,
  balanceResolution: 0.1,
  precisionResolution: 0.01,
  /** Hot plate power (W) and heat-loss coefficient (W/K). Max ≈ 20 + P/h °C. */
  burnerPowerW: 1500,
  heatLossWPerK: 4.5,
  /** Pour rates. */
  pourSolidGPerS: 5,
  pourSolidFineGPerS: 0.25,
  pourLiquidMLPerS: 15,
  pourLiquidFineMLPerS: 0.5,
  flameTestSampleG: 0.05,
  /** Valve conductance into the recombiner, mol/(atm·s). */
  valveConductance: 0.004,
  valveFineConductance: 0.0008,
  lifeSupportFeedMolPerS: 0.08,
  recombinerRepairS: 20,
  tankRepairS: 15,
};

export const SURVIVAL = {
  startO2Mol: 1.2,
  startWaterML: 120,
  o2UseMolPerS: 0.001,
  waterUseMLPerS: 0.05,
  goalO2Minutes: 50,
  goalWaterML: 200,
};

export const START_CREDITS = 0;

export const MANUAL_NOTES = [
  {
    id: 'manual_o2',
    title: 'Lab manual, p. 12 (singed)',
    text:
      'Emergency oxygen: potassium chlorate releases oxygen when heated. Pure KClO₃ needs over 400 °C, ' +
      'but a little manganese dioxide (a dense black mineral) catalyses it at ~200 °C. The catalyst is not used up. ' +
      'Heat in the sealed reaction flask so the gas is piped to the O₂ tank.',
  },
  {
    id: 'manual_recombiner',
    title: 'Recombiner placard',
    text:
      'Burns hydrogen and oxygen into water, then purges the chamber. Any unburnt gas is purged and lost. ' +
      'Chamber: 20 L. DO NOT ignite above 5.0 atm.',
  },
  {
    id: 'manual_tanks',
    title: 'Tank labels',
    text: 'H₂ tank: 10 L, rated 50 atm. O₂ tank: 5 L, rated 25 atm. Both kept at 20 °C.',
  },
];

export const WORLD = {
  width: 1280,
  height: 720,
  playerStart: { x: 470, y: 400 },
  lab: { x: 470, y: 250, w: 170, h: 110 },
  tradingPost: { x: 1050, y: 250, w: 170, h: 120 },
  wreck: { x: 300, y: 330 },
  harvestCooldownS: 1.0,
};

/**
 * Substance data. Every number here is meant to be checked and edited.
 *
 * Units:
 *   mw          g/mol (a unit test checks it against the formula)
 *   density     g/mL of the pure substance at ~25 °C
 *   mp, bp      °C (bp: null = decomposes / not volatile in the game)
 *   cp          J/(g·K) specific heat
 *   latent      J/g heat of vaporisation (volatile liquids only)
 *   solubility  g of solute per 100 g of solvent, as [°C, g/100 g] points;
 *               linear interpolation between points, clamped at the ends.
 *   color       RGB of the pure substance; `alpha` is how strongly it tints a
 *               liquid it is dissolved/mixed in (0 = colourless).
 *
 * Values marked "est." are reasonable estimates where good literature data are
 * scarce; they are tuned so the standard procedure behaves like the real lab.
 */

export type Phase = 'solid' | 'liquid';

export interface Substance {
  id: string;
  name: string;
  formula: string;
  smiles: string;
  mw: number;
  density: number;
  mp: number;
  bp: number | null;
  phase: Phase;
  cp: number;
  latent?: number;
  color: [number, number, number];
  alpha: number;
  /** Solubility of this substance in each solvent (keys are solvent ids). */
  solubility?: Record<string, [number, number][]>;
  /** Shown in the lab notebook / tooltips. */
  hazard?: string;
}

export const SUBSTANCES: Substance[] = [
  // ---------- solvents & simple liquids ----------
  {
    id: 'water', name: 'water', formula: 'H2O', smiles: 'O', mw: 18.015,
    density: 1.0, mp: 0, bp: 100, phase: 'liquid', cp: 4.18, latent: 2257,
    color: [90, 160, 255], alpha: 0.35,
  },
  {
    id: 'ethanol', name: 'ethanol', formula: 'C2H6O', smiles: 'CCO', mw: 46.07,
    density: 0.789, mp: -114, bp: 78.4, phase: 'liquid', cp: 2.44, latent: 841,
    color: [200, 225, 255], alpha: 0.2,
    hazard: 'Flammable. Keep away from open flames; heat on a hot plate or bath only.',
  },
  {
    id: 'acetic_anhydride', name: 'acetic anhydride', formula: 'C4H6O3', smiles: 'CC(=O)OC(C)=O', mw: 102.09,
    density: 1.082, mp: -73, bp: 139.8, phase: 'liquid', cp: 1.8, latent: 406,
    color: [215, 228, 240], alpha: 0.25,
    hazard: 'Corrosive, lachrymator (makes eyes water), reacts with water. Dispense in the fume hood.',
  },
  {
    id: 'acetic_acid', name: 'acetic acid', formula: 'C2H4O2', smiles: 'CC(=O)O', mw: 60.052,
    density: 1.049, mp: 16.6, bp: 118, phase: 'liquid', cp: 2.05, latent: 395,
    color: [220, 230, 240], alpha: 0.2,
    hazard: 'Corrosive vapours (vinegar smell).',
  },
  {
    // Treated as the pure acid; the stock bottle is 85 % w/w H3PO4 in water.
    id: 'phosphoric_acid', name: 'phosphoric acid', formula: 'H3PO4', smiles: 'OP(=O)(O)O', mw: 97.994,
    density: 1.88, mp: 42, bp: null, phase: 'liquid', cp: 1.06,
    color: [235, 240, 230], alpha: 0.15,
    hazard: 'Corrosive. Wear gloves and goggles.',
  },
  {
    // Ferric chloride test reagent (used as a ~1 % aqueous solution).
    id: 'ferric_chloride', name: 'iron(III) chloride', formula: 'FeCl3', smiles: 'Cl[Fe](Cl)Cl', mw: 162.2,
    density: 2.9, mp: 306, bp: null, phase: 'solid', cp: 0.7,
    color: [230, 150, 40], alpha: 2.5,
    solubility: { water: [[0, 74], [20, 92], [100, 535]] },
    hazard: 'Corrosive; stains skin and clothing.',
  },

  // ---------- aspirin synthesis ----------
  {
    id: 'salicylic_acid', name: 'salicylic acid', formula: 'C7H6O3', smiles: 'OC(=O)c1ccccc1O', mw: 138.12,
    density: 1.443, mp: 159, bp: null, phase: 'solid', cp: 1.16,
    color: [238, 236, 228], alpha: 0,
    solubility: {
      water: [[0, 0.12], [20, 0.22], [40, 0.42], [60, 0.95], [80, 2.2], [100, 6.7]],
      ethanol: [[0, 30], [25, 47], [60, 80]],
      acetic_anhydride: [[20, 12], [50, 30], [75, 60], [100, 90]], // est.
      acetic_acid: [[20, 9], [60, 30], [100, 70]], // est.
    },
    hazard: 'Irritant to eyes and skin.',
  },
  {
    id: 'aspirin', name: 'acetylsalicylic acid (aspirin)', formula: 'C9H8O4', smiles: 'CC(=O)Oc1ccccc1C(=O)O', mw: 180.16,
    density: 1.4, mp: 136, bp: null, phase: 'solid', cp: 1.2,
    color: [250, 250, 252], alpha: 0,
    solubility: {
      water: [[0, 0.12], [25, 0.33], [37, 1.0], [60, 1.9], [80, 3.0], [100, 4.5]], // est. above 37 °C
      ethanol: [[0, 15], [25, 25], [60, 60], [78, 90]], // est. above 60 °C
      acetic_anhydride: [[20, 8], [75, 40], [100, 60]], // est.
      acetic_acid: [[20, 5], [75, 35], [100, 55]], // est.
    },
  },
  {
    // Main side product of overheating: aspirin acylating unreacted salicylic acid.
    id: 'assa', name: 'acetylsalicylsalicylic acid', formula: 'C16H12O6',
    smiles: 'CC(=O)Oc1ccccc1C(=O)Oc1ccccc1C(=O)O', mw: 300.27,
    density: 1.4, mp: 159, bp: null, phase: 'solid', cp: 1.2,
    color: [236, 222, 170], alpha: 0.6,
    solubility: {
      water: [[0, 0.02], [100, 0.3]], // est.
      ethanol: [[0, 5], [25, 10], [60, 30]], // est.
      acetic_anhydride: [[20, 5], [75, 30]], // est.
      acetic_acid: [[20, 4], [75, 25]], // est.
    },
  },
  {
    // Lumped brown decomposition products from strong overheating (est. properties).
    id: 'tar', name: 'brown decomposition products', formula: 'C9H6O3', smiles: 'O=C1Oc2ccccc2C1=O', mw: 162.14,
    density: 1.3, mp: 90, bp: null, phase: 'solid', cp: 1.2,
    color: [120, 70, 30], alpha: 3,
    solubility: { water: [[0, 0.1], [100, 0.5]], ethanol: [[0, 20], [60, 40]], acetic_anhydride: [[20, 20]], acetic_acid: [[20, 20]] },
  },
  {
    // Violet complex that forms when Fe3+ meets a phenol (salicylic acid has one; aspirin does not).
    // FeCl3 + C7H6O3 → [Fe(C7H4O3)]Cl + 2 HCl
    id: 'iron_salicylate', name: 'iron(III)–salicylate complex', formula: 'C7H4ClFeO3', smiles: 'O=C1O[Fe](Cl)Oc2ccccc12', mw: 227.4,
    density: 1.5, mp: 300, bp: null, phase: 'solid', cp: 1.0,
    color: [110, 30, 140], alpha: 8,
    solubility: { water: [[0, 50], [100, 50]] },
  },
  {
    // By-product of the ferric chloride test. Kept in solution (not volatile in the game).
    id: 'hcl', name: 'hydrochloric acid', formula: 'HCl', smiles: 'Cl', mw: 36.458,
    density: 1.19, mp: -27, bp: null, phase: 'liquid', cp: 3.0,
    color: [230, 235, 225], alpha: 0.05,
  },
];

const byId = new Map(SUBSTANCES.map((s) => [s.id, s]));

export function substance(id: string): Substance {
  const s = byId.get(id);
  if (!s) throw new Error(`Unknown substance ${id}`);
  return s;
}

/** Solubility (g per 100 g solvent) of `solute` in `solvent` at `tC`. 0 if not listed. */
export function solubility(solute: string, solvent: string, tC: number): number {
  const pts = substance(solute).solubility?.[solvent];
  if (!pts?.length) return 0;
  if (tC <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (tC <= pts[i][0]) {
      const [t0, s0] = pts[i - 1];
      const [t1, s1] = pts[i];
      return s0 + ((s1 - s0) * (tC - t0)) / (t1 - t0);
    }
  }
  return pts[pts.length - 1][1];
}

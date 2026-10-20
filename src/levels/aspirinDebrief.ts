import type { Lot } from '../chem/lot';
import { ASPIRIN_TARGET, MISTAKES, PROCEDURE } from '../data/levels/aspirin';
import { substance } from '../data/substances';

/** What the level recorded while the player worked. */
export interface AspirinRecord {
  saAddedG: number;
  ac2oAddedG: number;
  catalystG: number;
  /** Lab seconds the reaction flask spent ≥ 60 °C in the bath. */
  heatSeconds: number;
  maxReactionC: number;
  /** Water added while the flask was still warm, before the cold water. */
  quenchWaterG: number;
  /** Acetic anhydride left in the flask when the cold water went in (g). */
  ac2oAtColdWaterG: number | null;
  /** Acetic anhydride still in the flask when the crystals went to the filter (g). */
  ac2oAtFiltrationG: number | null;
  recrystallised: boolean;
  /** Largest impurity co-precipitation ratio during recrystallisation (0..0.85). */
  worstInclusion: number;
  /** Ice-cold water poured over crystals in the Büchner funnel (g). */
  washWaterG: number;
  spilledML: number;
  labSeconds: number;
  hoodViolations: number;
  /** mol of aspirin made, of side products made, of aspirin hydrolysed. */
  aspirinMadeMol: number;
  sideMadeMol: number;
  hydrolysedMol: number;
  mpMeasured: boolean;
  fecl3Result: 'violet' | 'yellow' | null;
}

export interface ProductAnalysis {
  massG: number;
  aspirinG: number;
  purity: number;
  /** Mole fraction of everything that is not aspirin. */
  xImpurity: number;
  wetFraction: number;
  saFraction: number;
  mpLow: number;
  mpHigh: number;
}

const VOLATILE_SOLVENTS = ['water', 'ethanol', 'acetic_acid', 'acetic_anhydride'];

export function analyseProduct(lot: Lot): ProductAnalysis {
  const massG = lot.totalGrams();
  const aspirinG = lot.grams('aspirin');
  let molAll = 0;
  for (const id of lot.ids()) molAll += lot.mol(id);
  const xImpurity = molAll > 0 ? 1 - lot.mol('aspirin') / molAll : 1;
  const wet = VOLATILE_SOLVENTS.reduce((s, id) => s + lot.grams(id), 0);
  const { mpLow: lit, mpDepressionK: k } = ASPIRIN_TARGET;
  // Melting-point depression ≈ K·x(impurity); impure samples also melt over a wider range.
  const low = Math.max(70, lit - k * xImpurity - (xImpurity > 0.02 ? 1 : 0));
  const high = Math.min(ASPIRIN_TARGET.mpHigh, low + 1 + 25 * xImpurity);
  return {
    massG,
    aspirinG,
    purity: massG > 0 ? aspirinG / massG : 0,
    xImpurity,
    wetFraction: massG > 0 ? wet / massG : 0,
    saFraction: massG > 0 ? lot.grams('salicylic_acid') / massG : 0,
    mpLow: low,
    mpHigh: Math.max(low + 0.5, high),
  };
}

export interface Finding {
  id: string;
  title: string;
  explain: string;
  /** What specifically happened in this run. */
  detail: string;
}

export interface Debrief {
  theoreticalG: number;
  yieldPct: number;
  analysis: ProductAnalysis | null;
  mpText: string;
  fecl3Text: string;
  timeText: string;
  findings: Finding[];
  good: string[];
}

export function buildDebrief(product: Lot | null, r: AspirinRecord): Debrief {
  const saMol = r.saAddedG / substance('salicylic_acid').mw;
  const ac2oMol = r.ac2oAddedG / substance('acetic_anhydride').mw;
  const limitingMol = Math.min(saMol, ac2oMol);
  const theoreticalG = limitingMol * substance('aspirin').mw;
  const a = product && product.totalGrams() > 0.001 ? analyseProduct(product) : null;
  const yieldPct = theoreticalG > 0 && a ? (a.aspirinG / theoreticalG) * 100 : 0;
  const findings: Finding[] = [];
  const good: string[] = [];
  const add = (id: string, detail: string) => findings.push({ ...MISTAKES[id], detail });
  const conv = saMol > 0 ? r.aspirinMadeMol / saMol : 0;

  if (r.saAddedG < 1.8 || r.saAddedG > 2.2 || r.ac2oAddedG / 1.082 < 4.0) {
    const lim = ac2oMol < saMol ? ' Acetic anhydride became the limiting reagent.' : '';
    add('wrong_ratio', `You used ${r.saAddedG.toFixed(2)} g salicylic acid and ${(r.ac2oAddedG / 1.082).toFixed(1)} mL acetic anhydride (procedure: ${PROCEDURE.salicylicAcidG.toFixed(2)} g and ${PROCEDURE.aceticAnhydrideML.toFixed(1)} mL).${lim}`);
  } else good.push('Reagent amounts were on target, with salicylic acid as the limiting reagent.');

  if (r.catalystG < 0.05) add('no_catalyst', `No phosphoric acid reached the flask. Only ${(conv * 100).toFixed(0)} % of the salicylic acid reacted.`);
  else if (conv < 0.85) add('underheated', `Only ${(conv * 100).toFixed(0)} % of the salicylic acid was acetylated (${(r.heatSeconds / 60).toFixed(1)} min above 60 °C).`);
  else good.push(`${(conv * 100).toFixed(0)} % of the salicylic acid was acetylated.`);

  if (r.maxReactionC > 90 || (saMol > 0 && r.sideMadeMol / saMol > 0.02)) {
    add('overheated', `The reaction mixture reached ${r.maxReactionC.toFixed(0)} °C; ${((r.sideMadeMol / Math.max(saMol, 1e-9)) * 100).toFixed(1)} % of the material went to side products.`);
  } else if (r.heatSeconds > 0) good.push(`Temperature control was good (maximum ${r.maxReactionC.toFixed(0)} °C).`);

  if (r.quenchWaterG < 0.5 || (r.ac2oAtFiltrationG ?? 0) > 0.3) {
    const left = r.ac2oAtFiltrationG ? ` ${r.ac2oAtFiltrationG.toFixed(2)} g of acetic anhydride was still in the flask when you filtered.` : '';
    add('skipped_quench', `${r.quenchWaterG.toFixed(1)} g of water went into the warm flask before the cold work-up (procedure: about 1 g).${left}`);
  } else good.push('The excess anhydride was destroyed before filtration.');

  const trapped = a ? (product!.grams('salicylic_acid') + product!.grams('assa') + product!.grams('tar')) / Math.max(a.massG, 1e-9) : 0;
  if (r.worstInclusion > 0.4 && trapped > 0.005) {
    add(
      'cooled_fast',
      `Crystals came out of solution while it was cooling at roughly ${((r.worstInclusion - 0.04) / 0.035).toFixed(0)} °C per minute (a plunge into ice, or cold water poured into the hot solution). ${(trapped * 100).toFixed(1)} % of the product is trapped impurity.`,
    );
  }
  if (r.washWaterG < 5) add('skipped_wash', `Only ${r.washWaterG.toFixed(1)} g of cold wash water went over the crystals in the funnel.`);
  else good.push('The crystals were washed with cold water.');

  if (!r.recrystallised) add('no_recrystallisation', 'The crude product went straight to drying.');
  else good.push('The product was recrystallised.');

  if (r.hydrolysedMol > 0.03 * Math.max(r.aspirinMadeMol, 1e-9)) {
    add('hydrolysed', `${((r.hydrolysedMol / r.aspirinMadeMol) * 100).toFixed(1)} % of the aspirin hydrolysed back to salicylic acid.`);
  }

  if (a) {
    if (a.wetFraction > 0.02) add('not_dried', `The product is still ${(a.wetFraction * 100).toFixed(1)} % solvent by mass.`);
    else good.push('The product was dry.');
    if (a.saFraction > 0.01) add('unreacted_sa', `The product contains ${(a.saFraction * 100).toFixed(1)} % salicylic acid.`);
  }
  if (r.spilledML > 2) add('material_lost', `${r.spilledML.toFixed(1)} mL of material was spilled on the bench.`);
  if (r.hoodViolations > 0) {
    findings.push({
      id: 'hood',
      title: 'Acetic anhydride handled outside the fume hood',
      explain:
        'Acetic anhydride vapour is a strong irritant and lachrymator. In a real lab, measuring and pouring it on the open bench exposes you and everyone around you. Keep it in the hood until it is in the reaction flask.',
      detail: `It was poured outside the hood ${r.hoodViolations} time${r.hoodViolations > 1 ? 's' : ''}.`,
    });
  }

  const mpText = a
    ? `${a.mpLow.toFixed(1)}–${a.mpHigh.toFixed(1)} °C${r.mpMeasured ? '' : ' (calculated; you did not measure it)'} · literature ${ASPIRIN_TARGET.mpLow}–${ASPIRIN_TARGET.mpHigh} °C`
    : 'no product';
  const expectViolet = a ? a.saFraction > 0.005 : false;
  const fecl3Text =
    r.fecl3Result === null
      ? `not done${a ? ` (it would have been ${expectViolet ? 'violet' : 'yellow, i.e. negative'})` : ''}`
      : r.fecl3Result === 'violet'
        ? 'violet: salicylic acid present'
        : 'stayed yellow: no salicylic acid detected';
  const m = Math.floor(r.labSeconds / 60);
  return {
    theoreticalG,
    yieldPct,
    analysis: a,
    mpText,
    fecl3Text,
    timeText: `${Math.floor(m / 60)} h ${m % 60} min of lab time`,
    findings,
    good,
  };
}

/**
 * LEVEL 1 — ASPIRIN
 * Acetylation of salicylic acid with acetic anhydride, phosphoric acid catalyst.
 *
 *   C7H6O3 (salicylic acid) + C4H6O3 (acetic anhydride) → C9H8O4 (aspirin) + C2H4O2 (acetic acid)
 *
 * Quantities, temperatures and times follow a standard undergraduate procedure
 * (2.0 g salicylic acid, 5 mL acetic anhydride, 5 drops 85 % H3PO4, 70–80 °C
 * water bath for ~15 min, quench with water, ice bath, vacuum filtration,
 * recrystallisation from ethanol/water, melting point 135–136 °C).
 *
 * Rate constants are tuned estimates (not literature kinetics) chosen so that
 * the standard procedure gives a realistic result and each mistake produces
 * its real-world consequence. Every number is commented so it can be checked.
 */
import type { ReactionDef } from '../../chem/kinetics';

export const ASPIRIN_TARGET = {
  /** Literature melting point of aspirin, °C. */
  mpLow: 135,
  mpHigh: 136,
  /**
   * Freezing-point (melting-point) depression constant, °C per unit mole
   * fraction of impurity: R·Tm²/ΔHfus = 8.314 × 409² / 29 800 ≈ 47.
   */
  mpDepressionK: 47,
};

/** Standard procedure amounts (what the instructions ask for). */
export const PROCEDURE = {
  salicylicAcidG: 2.0,
  aceticAnhydrideML: 5.0,
  catalystDrops: 5,
  /** Water bath setpoint and minimum/maximum good range (°C). */
  bathC: 75,
  bathMinC: 65,
  bathMaxC: 85,
  /** Minutes of heating once the mixture is warm. */
  heatMinutes: 15,
  quenchDrops: 20,
  coldWaterML: 20,
  iceMinutes: 10,
  washML: 5,
  recrystEthanolML: 4,
  recrystWaterML: 13,
  dryMinutes: 20,
};

/** Stock bottles on the shelf. Amounts are what the bottle holds (g). */
export const STOCKS = [
  { id: 'sa', label: 'Salicylic acid', tag: [200, 200, 200] as [number, number, number], solid: { salicylic_acid: 100 } },
  { id: 'ac2o', label: 'Acetic anhydride', tag: [220, 70, 60] as [number, number, number], liquid: { acetic_anhydride: 108 }, hood: true },
  // 85 % w/w phosphoric acid: 85 g H3PO4 + 15 g water per 100 g.
  { id: 'h3po4', label: '85 % phosphoric acid', tag: [240, 200, 60] as [number, number, number], liquid: { phosphoric_acid: 85, water: 15 } },
  { id: 'water', label: 'Distilled water', tag: [80, 150, 230] as [number, number, number], liquid: { water: 500 } },
  // 95 % ethanol (by volume ≈ 92 % by mass).
  { id: 'etoh', label: 'Ethanol (95 %)', tag: [230, 130, 60] as [number, number, number], liquid: { ethanol: 370, water: 30 } },
  // 1 % ferric chloride test solution.
  { id: 'fecl3', label: '1 % FeCl₃ solution', tag: [200, 120, 40] as [number, number, number], liquid: { water: 99, ferric_chloride: 1 } },
];

/**
 * Reactions. Rate = k(T) · V · Π[i]^order (mol/s), concentrations in mol/L.
 * k is given at refC; Ea (kJ/mol) sets how strongly it depends on temperature.
 */
export const REACTIONS: ReactionDef[] = [
  {
    id: 'acetylation',
    name: 'Acetylation of salicylic acid',
    reactants: [{ id: 'salicylic_acid', coef: 1 }, { id: 'acetic_anhydride', coef: 1 }],
    products: [{ id: 'aspirin', coef: 1 }, { id: 'acetic_acid', coef: 1 }],
    deltaH: -45, // est., exothermic acyl transfer
    // With ~8 M anhydride at 75 °C: k·[Ac2O] ≈ 4.6e-3 /s → half-life ≈ 2.5 min, ~98 % in 15 min.
    k: 5.8e-4,
    refC: 75,
    Ea: 60,
    orders: { salicylic_acid: 1, acetic_anhydride: 1 },
    // Without acid catalyst the anhydride is a much poorer acylating agent (~3 % of the rate).
    catalyst: { id: 'phosphoric_acid', minGrams: 0.05, without: 0.03 },
  },
  {
    id: 'assa',
    name: 'Overheating side reaction: aspirin + salicylic acid → acetylsalicylsalicylic acid',
    reactants: [{ id: 'aspirin', coef: 1 }, { id: 'salicylic_acid', coef: 1 }],
    products: [{ id: 'assa', coef: 1 }, { id: 'water', coef: 1 }],
    deltaH: -5,
    // Negligible at 75 °C, ~10× faster at 95 °C (high activation energy).
    k: 1.7e-5,
    refC: 75,
    Ea: 120,
    orders: { aspirin: 1, salicylic_acid: 1 },
    catalyst: { id: 'phosphoric_acid', minGrams: 0.05, without: 0.1 },
  },
  {
    id: 'decomposition',
    name: 'Decomposition of aspirin when strongly overheated (brown products)',
    reactants: [{ id: 'aspirin', coef: 1 }],
    products: [{ id: 'tar', coef: 1 }, { id: 'water', coef: 1 }],
    deltaH: 0,
    k: 1e-5, // /s at 110 °C; ~30× faster at 140 °C
    refC: 110,
    Ea: 150,
    orders: { aspirin: 1 },
    minC: 90,
  },
  {
    id: 'anhydride_hydrolysis',
    name: 'Hydrolysis of excess acetic anhydride (the quench)',
    reactants: [{ id: 'acetic_anhydride', coef: 1 }, { id: 'water', coef: 1 }],
    products: [{ id: 'acetic_acid', coef: 2 }],
    deltaH: -58, // strongly exothermic
    // Acid-catalysed here by the H3PO4: at 25 °C in water, half-life ≈ 3 min;
    // at 80 °C (the exotherm heats the quench) it is gone in about a minute;
    // in an ice bath it takes ~20 min.
    k: 8e-5,
    refC: 25,
    Ea: 60,
    orders: { acetic_anhydride: 1, water: 1 },
  },
  {
    id: 'aspirin_hydrolysis',
    name: 'Hydrolysis of aspirin in hot water',
    reactants: [{ id: 'aspirin', coef: 1 }, { id: 'water', coef: 1 }],
    products: [{ id: 'salicylic_acid', coef: 1 }, { id: 'acetic_acid', coef: 1 }],
    deltaH: 0,
    // In pure water: half-life ≈ 4 days at 25 °C, ≈ 25 min at 100 °C.
    k: 3.6e-8,
    refC: 25,
    Ea: 70,
    orders: { aspirin: 1, water: 1 },
  },
  {
    id: 'ferric_test',
    name: 'Ferric chloride test: Fe³⁺ + phenol → violet complex',
    reactants: [{ id: 'ferric_chloride', coef: 1 }, { id: 'salicylic_acid', coef: 1 }],
    products: [{ id: 'iron_salicylate', coef: 1 }, { id: 'hcl', coef: 2 }],
    deltaH: 0,
    k: 5,
    refC: 25,
    Ea: 20,
    orders: { ferric_chloride: 1, salicylic_acid: 1 },
    requires: ['water'],
  },
];

export interface StepDef {
  id: string;
  title: string;
  detail: string;
  safety: string[];
}

/** The written procedure shown in Instruction mode. */
export const STEPS: StepDef[] = [
  {
    id: 'weigh_sa',
    title: 'Weigh 2.00 g of salicylic acid into the 125 mL Erlenmeyer flask',
    detail: 'Put the flask on the balance and tare it. Tilt the salicylic acid jar gently over the flask until the balance reads 2.00 g.',
    safety: ['Goggles and gloves on for the whole lab.', 'Salicylic acid irritates eyes and skin. Sweep up spills right away.'],
  },
  {
    id: 'measure_ac2o',
    title: 'In the fume hood, measure 5.0 mL of acetic anhydride',
    detail: 'Pour it into the 10 mL graduated cylinder and read the bottom of the meniscus.',
    safety: [
      'Acetic anhydride is corrosive and a lachrymator (it makes your eyes stream). Dispense it only inside the fume hood.',
      'It reacts with water. Keep the bottle closed when not pouring.',
    ],
  },
  {
    id: 'add_ac2o',
    title: 'Add the acetic anhydride to the salicylic acid',
    detail: 'Pour it in so it washes any crystals down from the walls of the flask.',
    safety: ['Pour slowly, keeping the flask in the hood.'],
  },
  {
    id: 'add_catalyst',
    title: 'Add 5 drops of 85 % phosphoric acid',
    detail: 'Use a pipette: click the pipette in the acid bottle to fill it, then hold it over the flask and click once per drop.',
    safety: ['Concentrated phosphoric acid is corrosive. Wear gloves and add it one drop at a time.'],
  },
  {
    id: 'heat',
    title: 'Swirl, then heat in the 75 °C water bath for 15 minutes',
    detail: 'Set the bath to 75 °C and stand the flask in it. The solid dissolves as it warms; keep heating 15 minutes in total. Fast-forward helps.',
    safety: ['The bath water is hot enough to scald. Handle the flask by its neck.', 'Keep the temperature below 85 °C.'],
  },
  {
    id: 'quench',
    title: 'While the flask is still warm, add 20 drops (1 mL) of water',
    detail: 'This destroys the leftover acetic anhydride. Expect it to fizz and steam.',
    safety: ['The reaction with water is vigorous and gives off hot acetic acid vapour. Add the water drop by drop, in the hood, with the flask pointing away from you.'],
  },
  {
    id: 'crystallise',
    title: 'Add 20 mL of cold water, cool to room temperature, then ice-bath 10 minutes',
    detail: 'Let it cool on the bench first, then put it in the ice bath. If no crystals appear, scratch the inside of the flask with the glass rod.',
    safety: ['Scratch gently. Cracked glass can break in the ice bath.'],
  },
  {
    id: 'filter_crude',
    title: 'Collect the crystals by vacuum filtration',
    detail: 'Seat the Büchner funnel on the filter stand over the filter flask, turn the vacuum on, and pour the slurry in. Rinse the flask with a little ice-cold water.',
    safety: [
      'Use only the thick-walled filter flask under vacuum. Thin glassware can implode.',
      'Turn the vacuum off before you take the funnel off.',
    ],
  },
  {
    id: 'wash',
    title: 'Wash the crystals with two 5 mL portions of ice-cold water',
    detail: 'Pour each portion over the crystals and let the vacuum pull it through. Cold water removes acid without dissolving much aspirin.',
    safety: ['Ice-cold water only. Warm water dissolves your product.'],
  },
  {
    id: 'recrystallise',
    title: 'Recrystallise from ethanol and water',
    detail:
      'Scrape the crude crystals into the 50 mL flask with the spatula (click to scoop, click again to tip out). Add about 4 mL of ethanol and warm it in the bath until they dissolve. Keeping the flask in the bath, add about 13 mL of water; if it turns cloudy, keep warming until it clears. Then let it cool slowly on the bench before the ice bath.',
    safety: [
      'Ethanol is flammable. Warm it only in the water bath, never over a flame.',
      'Do not boil aspirin in water. It hydrolyses back to salicylic acid.',
    ],
  },
  {
    id: 'filter_pure',
    title: 'Collect the recrystallised product by vacuum filtration',
    detail: 'Empty the filter flask first, then filter as before and rinse with a little ice-cold water.',
    safety: ['Same vacuum precautions as before.'],
  },
  {
    id: 'dry',
    title: 'Dry the crystals on a watch glass (about 20 minutes)',
    detail: 'Tip or scrape the crystals onto the watch glass and leave them to air-dry. Fast-forward helps.',
    safety: ['Label your product. Never taste anything made in the lab.'],
  },
  {
    id: 'weigh_product',
    title: 'Weigh your dry product',
    detail: 'Tare the balance, then put the watch glass with the product on it. (The glass weighs 18.30 g.)',
    safety: [],
  },
  {
    id: 'test_purity',
    title: 'Test purity: melting point and ferric chloride test',
    detail:
      'Stand the watch glass on the melting-point apparatus and run it (pure aspirin melts at 135–136 °C). For the FeCl₃ test, put a pinch of crystals (Shift+click with the spatula) in a test tube with about 1 mL of water and add a drop of FeCl₃. Violet means salicylic acid is still present.',
    safety: ['The melting-point block gets hot.', 'FeCl₃ is corrosive and stains. Dispose of the test solution in the waste.'],
  },
];

export interface MistakeDef {
  id: string;
  title: string;
  /** What happened and the real chemistry behind it. */
  explain: string;
}

export const MISTAKES: Record<string, MistakeDef> = {
  no_catalyst: {
    id: 'no_catalyst',
    title: 'No acid catalyst',
    explain:
      'Acetic anhydride is only a weak acylating agent on its own. A few drops of strong acid protonate its carbonyl oxygen and make it far more electrophilic, so the phenol –OH of salicylic acid attacks it quickly. Without the catalyst only a small fraction reacted in the time available, so most of the salicylic acid came through unchanged.',
  },
  underheated: {
    id: 'underheated',
    title: 'Not heated enough, or not for long enough',
    explain:
      'The acetylation is slow at room temperature. Holding the mixture at about 75 °C for 15 minutes raises the rate enough for nearly all of the salicylic acid to react. Less heat or less time leaves unreacted salicylic acid, which lowers the yield and gives a positive ferric chloride test.',
  },
  overheated: {
    id: 'overheated',
    title: 'Overheated the reaction',
    explain:
      'Above about 90 °C, aspirin starts acylating leftover salicylic acid to give acetylsalicylsalicylic acid and similar esters, and very hot mixtures turn brown as aspirin decomposes. These side products carry over into your crystals, lower the melting point and reduce the yield.',
  },
  skipped_quench: {
    id: 'skipped_quench',
    title: 'Skipped the water quench',
    explain:
      'The procedure uses a large excess of acetic anhydride, roughly 3.7 equivalents. Adding a little water while the mixture is warm hydrolyses the excess to acetic acid quickly. Without that step the anhydride survives into the cold work-up, where it hydrolyses only slowly, so it contaminates the crystals and the product smells of vinegar.',
  },
  cooled_fast: {
    id: 'cooled_fast',
    title: 'Cooled too fast',
    explain:
      'Crystals that grow slowly have time to reject molecules that do not fit their lattice. Plunging a hot solution straight into ice makes many small crystals very fast, and they trap impurities and mother liquor inside them. Cooling to room temperature first, then using ice, gives larger and purer crystals.',
  },
  skipped_wash: {
    id: 'skipped_wash',
    title: 'Crystals not washed',
    explain:
      'The liquid left clinging to filtered crystals is mother liquor, full of phosphoric acid, acetic acid and dissolved by-products. Rinsing with small portions of ice-cold water removes it while dissolving very little aspirin. Without the wash, that acid dries onto your product.',
  },
  not_dried: {
    id: 'not_dried',
    title: 'Product not dry',
    explain:
      'Water left in the crystals adds to the mass, so the yield looks higher than it really is. It also acts as an impurity in the melting-point test, so the sample melts low and over a wide range.',
  },
  unreacted_sa: {
    id: 'unreacted_sa',
    title: 'Salicylic acid in the product (positive FeCl₃ test)',
    explain:
      'Iron(III) forms an intensely violet complex with phenols. Salicylic acid has a free phenol –OH and aspirin does not, because it has been acetylated. A violet result means salicylic acid survived, from an incomplete reaction, from hydrolysis of aspirin in hot water, or because the crude product was never recrystallised.',
  },
  hydrolysed: {
    id: 'hydrolysed',
    title: 'Aspirin hydrolysed during work-up',
    explain:
      'Aspirin is an ester, and hot water slowly hydrolyses it back to salicylic acid and acetic acid. Keeping the recrystallisation warm only as long as needed, and never boiling it, limits this loss.',
  },
  no_recrystallisation: {
    id: 'no_recrystallisation',
    title: 'Crude product not recrystallised',
    explain:
      'Crude aspirin straight from the reaction contains co-precipitated salicylic acid and by-products. Recrystallising from a solvent in which aspirin is very soluble hot but much less soluble cold leaves most impurities behind in the mother liquor.',
  },
  wrong_ratio: {
    id: 'wrong_ratio',
    title: 'Reagent amounts off',
    explain:
      'Salicylic acid is the limiting reagent and acetic anhydride is used in excess so that every salicylic acid molecule reacts. Too little anhydride makes it the limiting reagent and caps the yield. Too much salicylic acid simply goes unreacted.',
  },
  material_lost: {
    id: 'material_lost',
    title: 'Material lost in transfers',
    explain:
      'Every spill, every crystal left on the glassware and every over-generous wash costs yield. Rinsing glassware with the cold filtrate, not with fresh solvent, recovers crystals without dissolving more product.',
  },
};

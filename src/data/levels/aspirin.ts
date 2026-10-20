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
    effect: 'makes aspirin from salicylic acid',
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
    effect: 'side reaction when too hot: aspirin + salicylic acid → ester by-product',
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
    effect: 'decomposes aspirin to brown products (overheated)',
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
    effect: 'destroys leftover acetic anhydride (hot and vigorous)',
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
    effect: 'slowly breaks aspirin back down to salicylic acid in hot water',
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
    effect: 'turns violet if salicylic acid is present',
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
  /** What to do. */
  detail: string;
  /** What this step achieves and why it is done this way. */
  why: string;
  /** Everything added in this step, and the reason it is there. */
  adds?: { what: string; why: string }[];
  /** The reaction this step runs (or must avoid), shown as an equation. */
  reaction?: { equation: string; note: string };
  /** What you should see. */
  watch?: string;
  safety: string[];
}

/** The first page of the lab manual. */
export const MANUAL_INTRO = {
  title: 'Experiment 1: Synthesis of aspirin',
  equation: 'C₇H₆O₃ + C₄H₆O₃ —H₃PO₄→ C₉H₈O₄ + C₂H₄O₂',
  equationNames: 'salicylic acid + acetic anhydride → acetylsalicylic acid (aspirin) + acetic acid',
  text: [
    'Aspirin is made by acetylating salicylic acid: the phenol –OH group of salicylic acid is turned into an acetate ester using acetic anhydride, with a few drops of acid as a catalyst.',
    'The plan: react (steps 1–5), destroy the excess anhydride (6), crystallise and collect the crude product (7–9), purify it by recrystallisation (10–11), then dry, weigh and test it (12–14).',
    'The manual turns to each step as you reach it. You can deviate from it, and the chemistry will play out.',
  ],
  controls: [
    'Drag glassware to move it. Right-drag, or hold it and use the wheel or Q/E, to tilt and pour. Rock it quickly to shake crystals loose.',
    'Pipette: click with the tip in a liquid to fill, then click over a vessel for one drop (Space also squeezes while you hold it).',
    'Spatula: click with the tip in crystals to scoop (Shift+click for a pinch), click again to tip them out. It also picks up spills.',
    'Glass rod: drag it inside a flask to stir; rubbing the glass scratches and starts crystals forming.',
    'The buttons on the equipment work: TARE on the balance, − / + / ON under the bath, VAC on the filter stand, RUN on the melting-point apparatus.',
  ],
};

/** The written procedure shown in Instruction mode. */
export const STEPS: StepDef[] = [
  {
    id: 'weigh_sa',
    title: 'Weigh 2.00 g of salicylic acid into the 125 mL Erlenmeyer flask',
    detail: 'Put the empty flask on the balance and press TARE on the balance. Tilt the salicylic acid jar gently over the flask until the balance reads 2.00 g.',
    why: 'Salicylic acid is the starting material and the limiting reagent: your theoretical yield is set by how much you weigh out here. 2.00 g is 14.5 mmol, enough to make at most 2.61 g of aspirin.',
    adds: [{ what: 'Salicylic acid, 2.00 g (14.5 mmol)', why: 'The molecule you are changing. Its phenol –OH group becomes an acetate ester.' }],
    watch: 'Tare with the empty flask on the pan, or the reading includes the glass (72.8 g).',
    safety: ['Goggles and gloves on for the whole lab.', 'Salicylic acid irritates eyes and skin. Pick up spills with the spatula.'],
  },
  {
    id: 'measure_ac2o',
    title: 'In the fume hood, measure 5.0 mL of acetic anhydride',
    detail: 'Pour acetic anhydride into the 10 mL graduated cylinder (it stands in the hood) until it reads 5.0 mL. Hover over the cylinder to read it.',
    why: 'Acetic anhydride supplies the acetyl group (CH₃CO–). 5.0 mL is 53 mmol, about 3.7 times the salicylic acid, so salicylic acid stays the limiting reagent and the reaction is pushed to completion. Because it is an excess, a graduated cylinder is accurate enough.',
    adds: [{ what: 'Acetic anhydride, 5.0 mL (5.4 g, 53 mmol)', why: 'The acetylating agent. Being a liquid, it also acts as the solvent the salicylic acid dissolves in when warm.' }],
    watch: 'A clear, colourless liquid with a sharp vinegar smell. If you can smell it, vapour is escaping: keep it in the hood.',
    safety: [
      'Acetic anhydride is corrosive and a lachrymator (it makes your eyes stream). Dispense it only inside the fume hood.',
      'It reacts with water. Keep the bottle closed when not pouring.',
    ],
  },
  {
    id: 'add_ac2o',
    title: 'Add the acetic anhydride to the salicylic acid',
    detail: 'Bring the flask into the fume hood and pour the anhydride in so it washes any crystals down from the walls.',
    why: 'The two reagents only react when they are in contact in solution. Washing crystals off the glass makes sure all the salicylic acid you weighed takes part.',
    watch: 'At room temperature most of the salicylic acid stays undissolved. That changes when you heat it.',
    safety: ['Pour slowly, keeping the flask in the hood.'],
  },
  {
    id: 'add_catalyst',
    title: 'Add 5 drops of 85 % phosphoric acid',
    detail: 'Click a pipette with its tip in the phosphoric acid bottle to fill it, hold it over the flask and click once per drop.',
    why: 'On its own the reaction is very slow. A strong acid protonates a carbonyl oxygen of the anhydride, making its carbonyl carbon far more electrophilic, so the weakly nucleophilic phenol oxygen can attack it. A catalyst is not used up, so a few drops are enough.',
    adds: [
      {
        what: '85 % phosphoric acid, 5 drops (≈0.25 mL)',
        why: 'Acid catalyst. Phosphoric acid is often chosen over sulfuric acid because it is less oxidising and causes fewer side reactions and less charring.',
      },
    ],
    reaction: {
      equation: 'C₇H₆O₃ + C₄H₆O₃ —H₃PO₄→ C₉H₈O₄ + C₂H₄O₂',
      note: 'This is the reaction that makes your product: the phenol –OH of salicylic acid becomes an ester (–OCOCH₃), and acetic acid is the by-product.',
    },
    watch: 'Nothing visible yet. The reaction needs heat.',
    safety: ['Concentrated phosphoric acid is corrosive. Wear gloves and add it one drop at a time.'],
  },
  {
    id: 'heat',
    title: 'Swirl, then heat in the 75 °C water bath for 15 minutes',
    detail: 'Use the − / + and ON buttons under the bath to set 75 °C and switch it on. Stand the flask in the bath, swirl it, and leave it there for 15 minutes. Fast-forward helps.',
    why: 'Heat speeds the reaction up (about twice as fast for every 10 °C) and dissolves the salicylic acid so it can react. 70–80 °C finishes the job in 15 minutes while staying below about 90 °C, where aspirin starts reacting with leftover salicylic acid and decomposing.',
    reaction: {
      equation: 'C₇H₆O₃ + C₄H₆O₃ —H₃PO₄, 75 °C→ C₉H₈O₄ + C₂H₄O₂',
      note: 'Watch the structure bar at the top: salicylic acid is converted into aspirin as the reaction runs.',
    },
    watch: 'The solid dissolves within a couple of minutes and the solution stays clear and colourless. A yellow or brown tint means it got too hot.',
    safety: ['The bath water is hot enough to scald. Handle the flask by its neck.', 'Keep the temperature below 85 °C.'],
  },
  {
    id: 'quench',
    title: 'While the flask is still warm, add 20 drops (1 mL) of water',
    detail: 'Take the flask out of the bath. While it is still warm, add 20 drops of water from a pipette, one drop at a time.',
    why: 'About 40 mmol of acetic anhydride is left over, and it would contaminate the product. Water hydrolyses it to acetic acid, which is soluble and washes away later. Warm, this takes a minute or two; drop by drop keeps the heat it gives off under control.',
    adds: [{ what: 'Water, 1 mL', why: 'A reagent here, not a solvent: it destroys the excess anhydride.' }],
    reaction: {
      equation: 'C₄H₆O₃ + H₂O → 2 C₂H₄O₂   (ΔH ≈ −58 kJ/mol)',
      note: 'Strongly exothermic. The flask warms up and gives off acetic acid vapour.',
    },
    watch: 'Hissing, steam and a strong vinegar smell.',
    safety: ['This reaction is vigorous and gives off hot acetic acid vapour. Add the water drop by drop, in the hood, with the flask pointing away from you.'],
  },
  {
    id: 'crystallise',
    title: 'Add 20 mL of cold water, cool to room temperature, then ice-bath 10 minutes',
    detail: 'Pour in about 20 mL of cold water. Let the flask cool on the bench, then put it in the ice bath for 10 minutes. If no crystals appear, scratch the inside of the flask with the glass rod.',
    why: 'Aspirin dissolves well in the warm acetic acid mixture but only about 0.3 g per 100 mL in cold water. Adding water and cooling makes the solution supersaturated, so aspirin crystallises while acetic acid, phosphoric acid and most leftover salicylic acid stay dissolved. Scratching the glass creates rough spots where the first crystals can form.',
    adds: [{ what: 'Cold water, 20 mL', why: 'An anti-solvent: it lowers aspirin’s solubility so it crystallises. It also finishes hydrolysing any remaining anhydride.' }],
    watch: 'White crystals appear and the mixture thickens to a slurry.',
    safety: ['Scratch gently. Cracked glass can break in the ice bath.'],
  },
  {
    id: 'filter_crude',
    title: 'Collect the crystals by vacuum filtration',
    detail: 'Check the Büchner funnel sits on the filter stand over the filter flask and press VAC on the stand. Pour the slurry in, rocking the flask to shake the crystals out. Rinse the flask with a little ice-cold water and pour that in too.',
    why: 'Vacuum filtration separates the crystals from the mother liquor (the liquid holding the impurities) quickly, and leaves them much drier than letting liquid drip through on its own.',
    watch: 'Clear filtrate collects in the flask below while a white cake builds up on the paper.',
    safety: ['Use only the thick-walled filter flask under vacuum. Thin glassware can implode.', 'Turn the vacuum off before you take the funnel off.'],
  },
  {
    id: 'wash',
    title: 'Wash the crystals with two 5 mL portions of ice-cold water',
    detail: 'With the vacuum on, pour about 5 mL of ice-cold water over the crystals and let it pull through. Repeat once.',
    why: 'The film of liquid clinging to the crystals still holds phosphoric acid, acetic acid and dissolved salicylic acid. Rinsing replaces it with clean water. Ice-cold water in small portions dissolves as little aspirin as possible.',
    adds: [{ what: 'Ice-cold water, 2 × 5 mL', why: 'Wash solvent: removes the acidic mother liquor from the crystal surfaces.' }],
    safety: ['Ice-cold water only. Warm water dissolves your product.'],
  },
  {
    id: 'recrystallise',
    title: 'Recrystallise from ethanol and water',
    detail:
      'Scrape the crude crystals into the 50 mL flask with the spatula. Add about 4 mL of ethanol and warm the flask in the bath until they dissolve. Keeping it in the bath, add about 13 mL of water; if it turns cloudy, keep warming until it clears. Then let it cool slowly on the bench before the ice bath.',
    why: 'Recrystallisation purifies a solid. Aspirin is very soluble in hot ethanol but much less soluble in cold ethanol–water. Dissolving the crude product hot and cooling it slowly lets pure aspirin crystals grow, while the small amounts of salicylic acid and side products stay in solution. Cooling too fast traps impurities inside the crystals.',
    adds: [
      { what: 'Ethanol, ≈4 mL', why: 'The “good” solvent: it dissolves aspirin when hot.' },
      { what: 'Water, ≈13 mL', why: 'The “poor” solvent: it lowers aspirin’s solubility so it crystallises as the mixture cools, while impurities stay dissolved.' },
    ],
    reaction: {
      equation: 'C₉H₈O₄ + H₂O → C₇H₆O₃ + C₂H₄O₂',
      note: 'The reaction to avoid. Hot water slowly hydrolyses aspirin back to salicylic acid, so warm the solution only as long as needed and never boil it.',
    },
    watch: 'A clear solution while hot; fine needles of aspirin growing as it cools.',
    safety: ['Ethanol is flammable. Warm it only in the water bath, never over a flame.'],
  },
  {
    id: 'filter_pure',
    title: 'Collect the recrystallised product by vacuum filtration',
    detail: 'Tip the filter flask’s contents into the waste bin first. Then vacuum-filter the recrystallised product as before and rinse it with a little ice-cold water.',
    why: 'The mother liquor now holds the impurities that recrystallisation left behind, so it has to be separated from the purified crystals.',
    adds: [{ what: 'Ice-cold water, a few mL', why: 'A final rinse of the pure crystals.' }],
    safety: ['Same vacuum precautions as before.'],
  },
  {
    id: 'dry',
    title: 'Dry the crystals on a watch glass (about 20 minutes)',
    detail: 'Leave the vacuum on for a few minutes to pull air through the crystals. Then scrape or tip them onto the watch glass and leave them to air-dry. Fast-forward helps.',
    why: 'Water left in the crystals adds mass, which makes the yield look too high, and it lowers and broadens the melting point. Drying removes it.',
    watch: 'The crystals change from clumped and glistening to a loose white powder.',
    safety: ['Label your product. Never taste anything made in the lab.'],
  },
  {
    id: 'weigh_product',
    title: 'Weigh your dry product',
    detail: 'With the pan empty, press TARE on the balance, then put the watch glass with your product on it. Subtract the watch glass (18.30 g).',
    why: 'Percent yield = mass of dry product ÷ theoretical yield (2.61 g for 2.00 g of salicylic acid) × 100. Losses come from incomplete reaction, aspirin that stays dissolved, and transfers.',
    safety: [],
  },
  {
    id: 'test_purity',
    title: 'Test purity: melting point and ferric chloride test',
    detail:
      'Stand the watch glass on the melting-point apparatus and press RUN. For the FeCl₃ test, put a pinch of crystals (Shift+click with the spatula) in a test tube with about 1 mL of water and add a drop of FeCl₃.',
    why: 'A pure compound melts sharply at its literature value (aspirin: 135–136 °C); impurities lower the melting point and spread it over a range. Iron(III) forms a violet complex with phenols. Salicylic acid has a phenol –OH and aspirin does not, so the test reveals unreacted or hydrolysed starting material.',
    adds: [{ what: '1 % FeCl₃ solution, 1 drop', why: 'Test reagent for phenols.' }],
    reaction: { equation: 'FeCl₃ + C₇H₆O₃ → [Fe(C₇H₄O₃)]Cl + 2 HCl', note: 'Violet means salicylic acid is present; pale yellow means it is not.' },
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

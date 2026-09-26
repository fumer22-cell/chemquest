/**
 * Reaction definitions. Coefficients must balance (a unit test checks every reaction).
 *
 * deltaH is in kJ per mole of reaction *as written*, with every species in its
 * pure standard state (e.g. HCl(g), NaOH(s), CaCl2(s)). Dissolving/undissolving
 * heat is added separately by the engine from each substance's heatOfSolution,
 * so net aqueous values come out right (e.g. HCl + NaOH ≈ -56 kJ/mol).
 */
export interface Term {
  id: string;
  coef: number;
}

export interface ReactionConditions {
  /** Mixture temperature must be at least this (K). */
  minTempK?: number;
  /** This substance must be present (not consumed). */
  catalyst?: string;
  /** Needs liquid water in the vessel. */
  requiresWater?: boolean;
  /** Needs an ignition spark (recombiner). */
  spark?: boolean;
  /** Reactant must stay at or above this molarity (mol/L) for the reaction to run. */
  minMolarity?: Record<string, number>;
}

export interface ReactionDef {
  id: string;
  name: string;
  reactants: Term[];
  products: Term[];
  deltaH: number;
  conditions?: ReactionConditions;
  /** What the player sees happen. Used by the journal. */
  observation: string;
}

export const REACTIONS: ReactionDef[] = [
  {
    id: 'kclo3_decomp_cat',
    name: 'Catalysed decomposition of potassium chlorate',
    reactants: [{ id: 'KClO3', coef: 2 }],
    products: [{ id: 'KCl', coef: 2 }, { id: 'O2', coef: 3 }],
    deltaH: -77.6,
    conditions: { minTempK: 473, catalyst: 'MnO2' },
    observation: 'The melt bubbles steadily and a colourless gas streams out. The black solid is left unchanged.',
  },
  {
    id: 'kclo3_decomp',
    name: 'Thermal decomposition of potassium chlorate',
    reactants: [{ id: 'KClO3', coef: 2 }],
    products: [{ id: 'KCl', coef: 2 }, { id: 'O2', coef: 3 }],
    deltaH: -77.6,
    conditions: { minTempK: 700 },
    observation: 'At very high temperature the melt decomposes, releasing a colourless gas.',
  },
  {
    id: 'h2_combustion',
    name: 'Combustion of hydrogen',
    reactants: [{ id: 'H2', coef: 2 }, { id: 'O2', coef: 1 }],
    products: [{ id: 'H2O', coef: 2 }],
    deltaH: -571.6,
    conditions: { spark: true },
    observation: 'A sharp bang; droplets of water condense on the chamber walls.',
  },
  {
    id: 'caco3_hcl',
    name: 'Calcium carbonate with hydrochloric acid',
    reactants: [{ id: 'CaCO3', coef: 1 }, { id: 'HCl', coef: 2 }],
    products: [{ id: 'CaCl2', coef: 1 }, { id: 'H2O', coef: 1 }, { id: 'CO2', coef: 1 }],
    deltaH: -82.5,
    conditions: { requiresWater: true },
    observation: 'Vigorous fizzing: a colourless gas bubbles off and the solid dissolves.',
  },
  {
    id: 'hcl_naoh',
    name: 'Neutralisation of hydrochloric acid by sodium hydroxide',
    reactants: [{ id: 'HCl', coef: 1 }, { id: 'NaOH', coef: 1 }],
    products: [{ id: 'NaCl', coef: 1 }, { id: 'H2O', coef: 1 }],
    deltaH: -179.1,
    conditions: { requiresWater: true },
    observation: 'No bubbles or colour change, but the solution warms up noticeably.',
  },
  {
    id: 'mno2_hcl',
    name: 'Manganese dioxide with hot concentrated hydrochloric acid',
    reactants: [{ id: 'MnO2', coef: 1 }, { id: 'HCl', coef: 4 }],
    products: [{ id: 'MnCl2', coef: 1 }, { id: 'Cl2', coef: 1 }, { id: 'H2O', coef: 2 }],
    deltaH: -163.7,
    conditions: { requiresWater: true, minTempK: 333, minMolarity: { HCl: 3.0 } },
    observation: 'A choking yellow-green gas is given off and the liquid turns faintly pink.',
  },
];

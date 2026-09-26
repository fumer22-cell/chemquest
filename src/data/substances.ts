/**
 * Substance definitions. Add new substances here; no game logic needs to change.
 *
 * Molar masses are NOT stored: they are computed from `formula` using elements.json.
 * Values are approximate 25 °C textbook data.
 */
export type PureState = 'solid' | 'liquid' | 'gas';

export interface SubstanceDef {
  /** Unique key used everywhere else (reactions, minerals, orders). */
  id: string;
  name: string;
  /** Chemical formula, parsed for composition and molar mass. Parentheses allowed. */
  formula: string;
  /** State of the pure substance at room temperature. */
  state: PureState;
  /** Density of the pure solid/liquid in g/mL. */
  density?: number;
  /** Solubility in g per 100 g water at 25 °C. Omitted = insoluble. */
  solubility?: number;
  /** Molar heat capacity, J/(mol·K). */
  cp: number;
  /** Enthalpy of solution, kJ/mol (negative = releases heat on dissolving). */
  heatOfSolution?: number;
  /** Strong acid: H+ released per formula unit when dissolved. */
  acidProtons?: number;
  /** Strong base: OH- released per formula unit when dissolved. */
  baseHydroxides?: number;
  /** Render colour for the undissolved solid / pure liquid / gas. */
  color: number;
  /** Colour it gives a solution (omit for colourless). */
  solutionColor?: number;
  /** What the player sees. */
  appearance: string;
}

export const SUBSTANCES: SubstanceDef[] = [
  {
    id: 'H2O', name: 'water', formula: 'H2O', state: 'liquid',
    density: 1.0, cp: 75.3, color: 0x7fc4ff, appearance: 'clear, colourless liquid',
  },
  {
    id: 'HCl', name: 'hydrogen chloride', formula: 'HCl', state: 'gas',
    solubility: 72, cp: 29.1, heatOfSolution: -74.8, acidProtons: 1,
    color: 0xe8f4ff, appearance: 'colourless, sharp-smelling gas; fumes in air (hydrochloric acid when dissolved)',
  },
  {
    id: 'NaOH', name: 'sodium hydroxide', formula: 'NaOH', state: 'solid',
    density: 2.13, solubility: 111, cp: 59.5, heatOfSolution: -44.5, baseHydroxides: 1,
    color: 0xf5f5f0, appearance: 'white waxy pellets; slippery and caustic',
  },
  {
    id: 'NaCl', name: 'sodium chloride', formula: 'NaCl', state: 'solid',
    density: 2.16, solubility: 36, cp: 50.5, heatOfSolution: 3.9,
    color: 0xf0f0ff, appearance: 'clear to white cubic crystals',
  },
  {
    id: 'KClO3', name: 'potassium chlorate', formula: 'KClO3', state: 'solid',
    density: 2.32, solubility: 7.3, cp: 100.3, heatOfSolution: 41.4,
    color: 0xffffff, appearance: 'white crystalline powder; strong oxidiser',
  },
  {
    id: 'KCl', name: 'potassium chloride', formula: 'KCl', state: 'solid',
    density: 1.98, solubility: 34, cp: 51.3, heatOfSolution: 17.2,
    color: 0xeeeeee, appearance: 'white crystalline solid',
  },
  {
    id: 'MnO2', name: 'manganese dioxide', formula: 'MnO2', state: 'solid',
    density: 5.03, cp: 54.1,
    color: 0x22201e, appearance: 'dense black, sooty solid',
  },
  {
    id: 'CaCO3', name: 'calcium carbonate', formula: 'CaCO3', state: 'solid',
    density: 2.71, cp: 83.5,
    color: 0xe9e4d4, appearance: 'white, chalky solid',
  },
  {
    id: 'CaCl2', name: 'calcium chloride', formula: 'CaCl2', state: 'solid',
    density: 2.15, solubility: 74.5, cp: 72.9, heatOfSolution: -82.8,
    color: 0xfafafa, appearance: 'white, water-absorbing solid',
  },
  {
    id: 'MnCl2', name: 'manganese(II) chloride', formula: 'MnCl2', state: 'solid',
    density: 2.98, solubility: 73.9, cp: 72.9, heatOfSolution: -73.0,
    color: 0xf2b8c6, solutionColor: 0xf6d2dc, appearance: 'pale pink solid',
  },
  {
    id: 'CO2', name: 'carbon dioxide', formula: 'CO2', state: 'gas',
    cp: 37.1, color: 0xdddddd, appearance: 'colourless gas; puts out flames',
  },
  {
    id: 'O2', name: 'oxygen', formula: 'O2', state: 'gas',
    cp: 29.4, color: 0xbfe6ff, appearance: 'colourless gas; relights a glowing splint',
  },
  {
    id: 'H2', name: 'hydrogen', formula: 'H2', state: 'gas',
    cp: 28.8, color: 0xffe9f0, appearance: 'colourless gas; burns with a squeaky pop',
  },
  {
    id: 'Cl2', name: 'chlorine', formula: 'Cl2', state: 'gas',
    cp: 33.9, color: 0xc8e04a, appearance: 'yellow-green, choking gas',
  },
];

/**
 * Minerals found around the crash site. The player only sees `label` and `look`
 * until the tests listed in `identifyAfter` have been observed.
 */
export type TestKind = 'flame' | 'acid' | 'water';

export interface MineralDef {
  id: string;
  /** True identity: substance id from substances.ts. */
  substanceId: string;
  label: string;
  look: string;
  mineralName: string;
  /** Colour of the deposit and sample on screen. */
  color: number;
  /** Deposit position on the world map. */
  deposit: { x: number; y: number };
  gramsPerHarvest: number;
  /** Tests that must be observed before the journal can name the mineral. */
  identifyAfter: TestKind[];
  /** Journal reasoning shown once identified. */
  conclusion: string;
}

export const MINERALS: MineralDef[] = [
  {
    id: 'A',
    substanceId: 'CaCO3',
    label: 'Sample A',
    look: 'white, chalky rock that scratches easily',
    mineralName: 'calcite',
    color: 0xe6dfc8,
    deposit: { x: 250, y: 560 },
    gramsPerHarvest: 25,
    identifyAfter: ['flame', 'acid'],
    conclusion:
      'Brick-red flame → calcium. Fizzes in acid, giving off a gas → a carbonate releasing CO₂. ' +
      'Sample A is calcite: calcium carbonate, CaCO₃.',
  },
  {
    id: 'B',
    substanceId: 'NaCl',
    label: 'Sample B',
    look: 'clear, cube-shaped crystals',
    mineralName: 'halite',
    color: 0xcfe3f0,
    deposit: { x: 1080, y: 590 },
    gramsPerHarvest: 25,
    identifyAfter: ['flame', 'water'],
    conclusion:
      'Intense yellow flame → sodium. Dissolves easily in water with no gas → a soluble sodium salt; ' +
      'the cubic crystals are rock salt. Sample B is halite: sodium chloride, NaCl.',
  },
  {
    id: 'C',
    substanceId: 'MnO2',
    label: 'Sample C',
    look: 'heavy, black, sooty rock that stains your gloves',
    mineralName: 'pyrolusite',
    color: 0x2b2826,
    deposit: { x: 640, y: 150 },
    gramsPerHarvest: 25,
    identifyAfter: ['flame', 'acid'],
    conclusion:
      'No flame colour (not Na, K, Ca, Cu…). Very dense, black, insoluble, and does not fizz in acid → not a carbonate. ' +
      'Matches the manual’s description of manganese dioxide: Sample C is pyrolusite, MnO₂ — the catalyst!',
  },
];

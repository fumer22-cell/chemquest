/**
 * Glassware catalogue. Sizes are in simulation pixels; one interior pixel holds
 * 0.05 mL (see config.ts), so e.g. a 26×40 beaker interior holds 52 mL.
 */
import {
  beakerShape,
  bottleShape,
  buchnerShape,
  cylinderShape,
  erlenmeyerShape,
  testTubeShape,
  watchGlassShape,
  type Reading,
  type Shape,
} from '../sim/shapes';

export interface GlasswareDef {
  id: string;
  name: string;
  make: () => Shape;
  /** Mass of the empty glass (g), seen by the balance. */
  glassMassG: number;
  /** How its graduations read, and the spacing of the marks (mL). */
  reading: Reading;
  gradStep: number;
  /** Stock bottles refill their visible pixels from a large hidden supply. */
  reservoir?: boolean;
}

export const GLASSWARE: Record<string, GlasswareDef> = {
  beaker50: { id: 'beaker50', name: '50 mL beaker', make: () => beakerShape(26, 40), glassMassG: 31.2, reading: 'beaker', gradStep: 10 },
  beaker100: { id: 'beaker100', name: '100 mL beaker', make: () => beakerShape(38, 54), glassMassG: 48.5, reading: 'beaker', gradStep: 10 },
  erlenmeyer50: { id: 'erlenmeyer50', name: '50 mL Erlenmeyer flask', make: () => erlenmeyerShape(32, 26, 8, 8), glassMassG: 34.6, reading: 'flask', gradStep: 10 },
  erlenmeyer125: { id: 'erlenmeyer125', name: '125 mL Erlenmeyer flask', make: () => erlenmeyerShape(50, 42, 12, 10), glassMassG: 72.8, reading: 'flask', gradStep: 25 },
  cylinder10: { id: 'cylinder10', name: '10 mL graduated cylinder', make: () => cylinderShape(6, 36), glassMassG: 21.4, reading: 'cylinder', gradStep: 0.2 },
  cylinder25: { id: 'cylinder25', name: '25 mL graduated cylinder', make: () => cylinderShape(10, 54), glassMassG: 38.9, reading: 'cylinder', gradStep: 0.5 },
  testTube: { id: 'testTube', name: 'test tube', make: () => testTubeShape(6, 30), glassMassG: 9.8, reading: 'tube', gradStep: 1 },
  watchGlass: { id: 'watchGlass', name: 'watch glass', make: () => watchGlassShape(30), glassMassG: 18.3, reading: 'none', gradStep: 1 },
  buchner: { id: 'buchner', name: 'Büchner funnel', make: () => buchnerShape(30, 14, 4, 8), glassMassG: 120, reading: 'none', gradStep: 1 },
  bottle: { id: 'bottle', name: 'reagent bottle', make: () => bottleShape(18, 22, 6, 5), glassMassG: 150, reading: 'none', gradStep: 1, reservoir: true },
};

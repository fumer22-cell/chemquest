import { describe, expect, it } from 'vitest';
import { molarMass, parseFormula, prettyFormula } from '../src/chem';

describe('formula parsing', () => {
  it('parses simple formulas', () => {
    expect(parseFormula('H2O')).toEqual({ H: 2, O: 1 });
    expect(parseFormula('KClO3')).toEqual({ K: 1, Cl: 1, O: 3 });
  });

  it('handles parentheses and hydrates', () => {
    expect(parseFormula('Ca(OH)2')).toEqual({ Ca: 1, O: 2, H: 2 });
    expect(parseFormula('Al2(SO4)3')).toEqual({ Al: 2, S: 3, O: 12 });
    expect(parseFormula('CuSO4·5H2O')).toEqual({ Cu: 1, S: 1, O: 9, H: 10 });
  });

  it('rejects unknown elements and bad syntax', () => {
    expect(() => parseFormula('Xx2')).toThrow();
    expect(() => parseFormula('Ca(OH2')).toThrow();
  });

  it('pretty-prints subscripts', () => {
    expect(prettyFormula('Ca(OH)2')).toBe('Ca(OH)₂');
  });
});

describe('molar mass', () => {
  it.each([
    ['H2O', 18.015],
    ['NaCl', 58.44],
    ['KClO3', 122.55],
    ['CaCO3', 100.086],
    ['HCl', 36.458],
    ['NaOH', 39.997],
    ['O2', 31.998],
  ])('%s ≈ %f g/mol', (f, m) => {
    expect(molarMass(f)).toBeCloseTo(m, 2);
  });
});

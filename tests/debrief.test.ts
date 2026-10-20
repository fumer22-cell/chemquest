import { describe, expect, it } from 'vitest';
import { newLot } from '../src/chem/lot';
import { analyseProduct, buildDebrief, type AspirinRecord } from '../src/levels/aspirinDebrief';

const good: AspirinRecord = {
  saAddedG: 2.0, ac2oAddedG: 5.41, catalystG: 0.36, heatSeconds: 900, maxReactionC: 74, quenchWaterG: 1.0,
  ac2oAtColdWaterG: 2.0, ac2oAtFiltrationG: 0.05, recrystallised: true, worstInclusion: 0.1, washWaterG: 10,
  spilledML: 0, labSeconds: 7200, hoodViolations: 0, aspirinMadeMol: 0.0140, sideMadeMol: 0, hydrolysedMol: 0,
  mpMeasured: true, fecl3Result: 'yellow',
};

function product(g: Record<string, number>) {
  const l = newLot('solid');
  for (const [id, m] of Object.entries(g)) l.addGrams(id, m);
  return l;
}

describe('melting point', () => {
  it('pure aspirin melts at 135–136 °C', () => {
    const a = analyseProduct(product({ aspirin: 1.8 }));
    expect(a.mpLow).toBeCloseTo(135, 1);
    expect(a.mpHigh).toBeCloseTo(136, 1);
  });

  it('impurities lower and broaden the melting range', () => {
    const a = analyseProduct(product({ aspirin: 1.7, salicylic_acid: 0.1 }));
    expect(a.mpLow).toBeLessThan(133);
    expect(a.mpHigh - a.mpLow).toBeGreaterThan(1.5);
  });

  it('a wet product melts low', () => {
    const a = analyseProduct(product({ aspirin: 1.7, water: 0.2 }));
    expect(a.wetFraction).toBeGreaterThan(0.1);
    expect(a.mpLow).toBeLessThan(120);
  });
});

describe('debrief', () => {
  const ids = (p: ReturnType<typeof buildDebrief>) => p.findings.map((f) => f.id);

  it('a clean run has no mistakes and a sensible yield', () => {
    const d = buildDebrief(product({ aspirin: 1.9 }), good);
    expect(ids(d)).toEqual([]);
    expect(d.theoreticalG).toBeCloseTo(2.61, 2);
    expect(d.yieldPct).toBeCloseTo(72.8, 0);
  });

  it.each([
    ['no_catalyst', { catalystG: 0, aspirinMadeMol: 0.002 }, { aspirin: 0.3, salicylic_acid: 1.2 }],
    ['underheated', { heatSeconds: 120, aspirinMadeMol: 0.006 }, { aspirin: 0.8 }],
    ['overheated', { maxReactionC: 110, sideMadeMol: 0.002 }, { aspirin: 1.5, assa: 0.1 }],
    ['skipped_quench', { quenchWaterG: 0, ac2oAtFiltrationG: 1.5 }, { aspirin: 1.8 }],
    ['skipped_wash', { washWaterG: 0 }, { aspirin: 1.8 }],
    ['not_dried', {}, { aspirin: 1.8, water: 0.3 }],
    ['unreacted_sa', {}, { aspirin: 1.7, salicylic_acid: 0.1 }],
    ['cooled_fast', { worstInclusion: 0.7 }, { aspirin: 1.7, salicylic_acid: 0.03 }],
    ['no_recrystallisation', { recrystallised: false }, { aspirin: 1.8 }],
    ['wrong_ratio', { ac2oAddedG: 1.0 }, { aspirin: 0.9 }],
    ['hood', { hoodViolations: 2 }, { aspirin: 1.8 }],
  ] as [string, Partial<AspirinRecord>, Record<string, number>][])('detects %s', (id, rec, prod) => {
    const d = buildDebrief(product(prod), { ...good, ...rec });
    expect(ids(d)).toContain(id);
    const f = d.findings.find((x) => x.id === id)!;
    expect(f.explain.length).toBeGreaterThan(80);
  });

  it('too little anhydride makes it the limiting reagent', () => {
    const d = buildDebrief(product({ aspirin: 0.9 }), { ...good, ac2oAddedG: 1.0 });
    expect(d.theoreticalG).toBeCloseTo((1.0 / 102.09) * 180.16, 2);
  });
});

/** Standard atomic weights for the elements used in the game's molecules. */
const ATOMIC_MASS: Record<string, number> = {
  H: 1.008, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Na: 22.99, Mg: 24.305,
  P: 30.974, S: 32.06, Cl: 35.45, K: 39.098, Fe: 55.845, Br: 79.904, I: 126.9,
};

/** "C9H8O4" → { C: 9, H: 8, O: 4 }. Supports parentheses. */
export function parseFormula(formula: string): Record<string, number> {
  let i = 0;
  const num = () => {
    const s = i;
    while (i < formula.length && /\d/.test(formula[i])) i++;
    return s === i ? 1 : parseInt(formula.slice(s, i), 10);
  };
  const group = (): Record<string, number> => {
    const out: Record<string, number> = {};
    const add = (el: string, n: number) => (out[el] = (out[el] ?? 0) + n);
    while (i < formula.length && formula[i] !== ')') {
      if (formula[i] === '(') {
        i++;
        const inner = group();
        i++; // ')'
        const n = num();
        for (const [el, c] of Object.entries(inner)) add(el, c * n);
      } else {
        const m = /^[A-Z][a-z]?/.exec(formula.slice(i));
        if (!m || !(m[0] in ATOMIC_MASS)) throw new Error(`Bad formula ${formula}`);
        i += m[0].length;
        add(m[0], num());
      }
    }
    return out;
  };
  return group();
}

export function molarMass(formula: string): number {
  return Object.entries(parseFormula(formula)).reduce((s, [el, n]) => s + ATOMIC_MASS[el] * n, 0);
}

/** "C9H8O4" → "C₉H₈O₄" */
export function prettyFormula(f: string): string {
  return f.replace(/\d+/g, (d) => [...d].map((c) => '₀₁₂₃₄₅₆₇₈₉'[+c]).join(''));
}

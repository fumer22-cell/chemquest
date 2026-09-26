import { getElement } from './elements';

/** Element symbol → atom count. */
export type Composition = Record<string, number>;

/**
 * Parse a chemical formula such as "H2O", "Ca(OH)2" or "CuSO4·5H2O" into atom counts.
 * Supports nested parentheses/brackets and a single hydrate dot (· or *).
 */
export function parseFormula(formula: string): Composition {
  const parts = formula.split(/[·*]/);
  const total: Composition = {};
  for (const part of parts) {
    const m = /^(\d*)(.*)$/.exec(part.trim())!;
    const mult = m[1] ? parseInt(m[1], 10) : 1;
    const comp = parseGroup(m[2]);
    for (const [el, n] of Object.entries(comp)) {
      total[el] = (total[el] ?? 0) + n * mult;
    }
  }
  return total;
}

function parseGroup(src: string): Composition {
  let i = 0;

  const readNumber = (): number => {
    const start = i;
    while (i < src.length && src[i] >= '0' && src[i] <= '9') i++;
    return start === i ? 1 : parseInt(src.slice(start, i), 10);
  };

  const parse = (closer: string | null): Composition => {
    const comp: Composition = {};
    const addTo = (el: string, n: number) => {
      comp[el] = (comp[el] ?? 0) + n;
    };
    while (i < src.length) {
      const ch = src[i];
      if (ch === '(' || ch === '[') {
        i++;
        const inner = parse(ch === '(' ? ')' : ']');
        const n = readNumber();
        for (const [el, c] of Object.entries(inner)) addTo(el, c * n);
      } else if (ch === ')' || ch === ']') {
        if (ch !== closer) throw new Error(`Unbalanced '${ch}' in formula "${src}"`);
        i++;
        return comp;
      } else if (ch >= 'A' && ch <= 'Z') {
        let sym = ch;
        i++;
        while (i < src.length && src[i] >= 'a' && src[i] <= 'z') sym += src[i++];
        getElement(sym); // throws on unknown symbols
        addTo(sym, readNumber());
      } else {
        throw new Error(`Unexpected '${ch}' in formula "${src}"`);
      }
    }
    if (closer) throw new Error(`Missing '${closer}' in formula "${src}"`);
    return comp;
  };

  return parse(null);
}

/** Molar mass in g/mol, computed from standard atomic weights. */
export function molarMass(formula: string): number {
  let m = 0;
  for (const [el, n] of Object.entries(parseFormula(formula))) {
    m += getElement(el).mass * n;
  }
  return m;
}

/** "H2O" → "H₂O" for display. */
export function prettyFormula(formula: string): string {
  const sub = '₀₁₂₃₄₅₆₇₈₉';
  return formula.replace(/(?<=[A-Za-z)\]])(\d+)/g, (d) =>
    [...d].map((c) => sub[+c]).join(''),
  );
}

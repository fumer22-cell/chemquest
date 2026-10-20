import { CELL, Grid, K } from './grid';

const { EMPTY, VOID } = CELL;

/** Per-tick conductance between neighbouring cells, by cell kind. */
const COND = new Float32Array(8);
COND[K.Wall] = 0.12;
COND[K.Powder] = 0.06;
COND[K.Liquid] = 0.2;
COND[K.Gas] = 0.04;
COND[K.Filter] = 0.05;

/** Per-tick loss toward ambient for a cell exposed to open air, by kind. */
const LOSS = new Float32Array(8);
LOSS[K.Wall] = 0.0025;
LOSS[K.Powder] = 0.002;
LOSS[K.Liquid] = 0.0015;
LOSS[K.Gas] = 0.02;
LOSS[K.Filter] = 0.002;

const exposed = (k: number) => k === EMPTY || k === VOID;

/**
 * Explicit heat diffusion between 4-neighbours plus cooling of cells that
 * touch open air. `outsideExposed` treats the grid edge as open air.
 */
export function conductHeat(g: Grid, ambientC: number, outsideExposed = true): void {
  const { w, h, kind, temp } = g;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const k = kind[i];
      if (k === EMPTY || k === VOID) continue;
      const ci = COND[k];
      if (x + 1 < w) {
        const kj = kind[i + 1];
        if (!exposed(kj)) {
          const f = Math.min(ci, COND[kj]) * (temp[i + 1] - temp[i]);
          temp[i] += f;
          temp[i + 1] -= f;
        }
      }
      if (y + 1 < h) {
        const j = i + w;
        const kj = kind[j];
        if (!exposed(kj)) {
          const f = Math.min(ci, COND[kj]) * (temp[j] - temp[i]);
          temp[i] += f;
          temp[j] -= f;
        }
      }
      // Cooling to room air.
      const open =
        (x > 0 ? exposed(kind[i - 1]) : outsideExposed) ||
        (x + 1 < w ? exposed(kind[i + 1]) : outsideExposed) ||
        (y > 0 ? exposed(kind[i - w]) : outsideExposed) ||
        (y + 1 < h ? exposed(kind[i + w]) : outsideExposed);
      if (open) temp[i] += (ambientC - temp[i]) * LOSS[k];
    }
  }
}

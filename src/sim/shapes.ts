import { VOL_PER_PX } from '../config';

/** Mask values. */
export const M_VOID = 0;
export const M_WALL = 1;
export const M_IN = 2;
export const M_FILTER = 3;

/** How the glassware's volume markings read. */
export type Reading = 'cylinder' | 'beaker' | 'flask' | 'tube' | 'none';

export interface Shape {
  w: number;
  h: number;
  mask: Uint8Array;
  /** Interior volume in mL. */
  capacityML: number;
}

/** Build a 1-pixel glass wall around an interior predicate. Row 0 interior = the mouth. */
function build(w: number, h: number, inside: (x: number, y: number) => boolean): Shape {
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x, y)) mask[y * w + x] = M_IN;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] === M_IN) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[ny * w + nx] === M_IN) {
            near = true;
            break;
          }
        }
      }
      if (near) mask[i] = M_WALL;
    }
  }
  return { w, h, mask, capacityML: countIn(mask) * VOL_PER_PX };
}

function countIn(mask: Uint8Array): number {
  let c = 0;
  for (const m of mask) if (m === M_IN) c++;
  return c;
}

export function beakerShape(innerW: number, innerH: number): Shape {
  const w = innerW + 2;
  const h = innerH + 1;
  return build(w, h, (x, y) => x >= 1 && x <= innerW && y < innerH);
}

export function erlenmeyerShape(base: number, coneH: number, neck: number, neckH: number): Shape {
  const w = base + 2;
  const h = neckH + coneH + 1;
  const cx = (w - 1) / 2;
  return build(w, h, (x, y) => {
    if (y >= neckH + coneH) return false;
    const half = y < neckH ? neck / 2 : (neck + ((base - neck) * (y - neckH + 1)) / coneH) / 2;
    return Math.abs(x - cx) < half;
  });
}

export function cylinderShape(innerW: number, innerH: number): Shape {
  const foot = 3;
  const w = innerW + 2 + foot * 2;
  const h = innerH + 2;
  const s = build(w, h, (x, y) => x >= foot + 1 && x <= foot + innerW && y < innerH);
  // Wide foot.
  for (let x = 1; x < w - 1; x++) s.mask[(h - 1) * w + x] = M_WALL;
  return s;
}

export function testTubeShape(innerW: number, innerH: number): Shape {
  const w = innerW + 2;
  const h = innerH + 1;
  const r = innerW / 2;
  const cx = (w - 1) / 2;
  return build(w, h, (x, y) => {
    if (x < 1 || x > innerW || y >= innerH) return false;
    const fromBottom = innerH - 1 - y;
    if (fromBottom >= r) return true;
    return (x - cx) ** 2 + (r - fromBottom - 0.5) ** 2 <= r * r;
  });
}

export function bottleShape(bodyW: number, bodyH: number, neckW: number, neckH: number): Shape {
  const w = bodyW + 2;
  const h = neckH + bodyH + 1;
  const cx = (w - 1) / 2;
  return build(w, h, (x, y) => {
    if (y >= neckH + bodyH) return false;
    if (y < neckH) return Math.abs(x - cx) < neckW / 2;
    const shoulder = y - neckH;
    const half = shoulder < 3 ? neckW / 2 + ((bodyW - neckW) / 2) * ((shoulder + 1) / 3) : bodyW / 2;
    return Math.abs(x - cx) < half;
  });
}

export function watchGlassShape(innerW: number): Shape {
  const w = innerW + 2;
  const h = 5;
  const cx = (w - 1) / 2;
  return build(w, h, (x, y) => {
    const t = Math.abs(x - cx) / (innerW / 2);
    if (t >= 1) return false;
    const depth = Math.round(4 - 3 * t * t);
    return y < depth;
  });
}

/**
 * Büchner funnel: a wide porcelain cup whose floor is filter paper, with a
 * narrow stem that opens at the bottom of the grid.
 */
export function buchnerShape(innerW: number, cupH: number, stemW: number, stemH: number): Shape {
  const w = innerW + 2;
  const h = cupH + 2 + stemH;
  const cx = (w - 1) / 2;
  const s = build(w, h, (x, y) => {
    if (y < cupH) return x >= 1 && x <= innerW;
    if (y === cupH) return x >= 1 && x <= innerW; // filter row (set below)
    if (y === cupH + 1) return Math.abs(x - cx) < innerW / 2 - 1; // drain space under the paper
    return Math.abs(x - cx) < stemW / 2; // stem, open at the bottom edge
  });
  for (let x = 1; x <= innerW; x++) s.mask[cupH * w + x] = M_FILTER;
  // Plate below the drain space, except the stem hole.
  for (let x = 0; x < w; x++) {
    const i = (cupH + 2) * w + x;
    if (Math.abs(x - cx) >= stemW / 2 && s.mask[i] === M_VOID && Math.abs(x - cx) < innerW / 2 + 1) s.mask[i] = M_WALL;
  }
  s.capacityML = cupH * innerW * VOL_PER_PX;
  return s;
}

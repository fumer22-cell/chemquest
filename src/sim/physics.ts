import { CELL, Grid, K } from './grid';

const { EMPTY, FILTER, GAS, LIQUID, POWDER } = CELL;

/** The 8 neighbour directions, in angle order (screen coords, y down). */
const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];

export interface StepHooks {
  /**
   * A particle at cell i tried to move to (nx, ny) outside the grid.
   * Return true if it was taken elsewhere (the hook clears cell i).
   */
  exit?(i: number, nx: number, ny: number): boolean;
  /** World only: per-cell occupancy from containers (-1 open, -2 glass, k ≥ 0 inside container k). */
  occ?: Int32Array;
  /** World only: particle i moves into container `k` at world cell j. Return true if accepted. */
  portal?(i: number, j: number, k: number): boolean;
  /** Probability per tick that liquid seeps through a filter cell (vacuum raises it). */
  filterRate?: number;
}

/** Liquids look this many cells sideways per tick when they can't fall. */
const DISPERSION = 4;

let tickNo = 1;

/**
 * Advance one tick of falling-sand motion with gravity along (gx, gy).
 * Gravity can point any way: a tilted container just has tilted gravity.
 */
export function stepGrid(g: Grid, gx: number, gy: number, hooks: StepHooks = {}): void {
  tickNo = (tickNo + 1) & 255 || 1;
  const stamp = tickNo;
  const ang = Math.atan2(gy, gx) / (Math.PI / 4);
  const base = Math.floor(ang);
  const frac = ang - base;
  const dA = ((base % 8) + 8) % 8;
  const dB = (dA + 1) % 8;

  const { w, h, kind } = g;
  // Scan so that particles nearest the "floor" move first.
  const xMajor = Math.abs(gx) > Math.abs(gy);
  const flip = Math.random() < 0.5;
  const outerN = xMajor ? w : h;
  const innerN = xMajor ? h : w;
  const outerRev = xMajor ? gx > 0 : gy > 0;

  for (let o = 0; o < outerN; o++) {
    const oo = outerRev ? outerN - 1 - o : o;
    for (let n = 0; n < innerN; n++) {
      const nn = flip ? innerN - 1 - n : n;
      const x = xMajor ? oo : nn;
      const y = xMajor ? nn : oo;
      const i = y * w + x;
      const k = kind[i];
      if (k < POWDER || k > GAS || g.stamp[i] === stamp) continue;
      const d = Math.random() < frac ? dB : dA;
      if (k === POWDER) movePowder(g, i, x, y, d, stamp, hooks);
      else if (k === LIQUID) moveLiquid(g, i, x, y, d, stamp, hooks);
      else moveGas(g, i, x, y, (d + 4) % 8, stamp, hooks);
    }
  }
}

const BLOCKED = 0;
const FREE = 1;
const GONE = 2;

const B = (k: K) => 1 << k;
const POWDER_INTO = B(K.Empty) | B(K.Gas) | B(K.Liquid);
const LIQUID_INTO = B(K.Empty) | B(K.Gas);
const GAS_INTO = B(K.Empty) | B(K.Liquid);

/**
 * Move the particle at i to (nx, ny) if allowed. `into` is a bitmask of the
 * cell kinds it may displace.
 */
function tryMove(g: Grid, i: number, nx: number, ny: number, stamp: number, hooks: StepHooks, into: number): number {
  if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) {
    return hooks.exit && hooks.exit(i, nx, ny) ? GONE : BLOCKED;
  }
  const j = ny * g.w + nx;
  if (hooks.occ) {
    const o = hooks.occ[j];
    if (o === -2) return BLOCKED;
    if (o >= 0) return hooks.portal!(i, j, o) ? GONE : BLOCKED;
  }
  const tk = g.kind[j];
  if (!((into >> tk) & 1)) return BLOCKED;
  if (tk === LIQUID && g.kind[i] === POWDER && Math.random() < 0.5) return BLOCKED; // sinks slowly
  g.swap(i, j);
  g.stamp[j] = stamp;
  return FREE;
}

function movePowder(g: Grid, i: number, x: number, y: number, d: number, s: number, hk: StepHooks): void {
  if (tryMove(g, i, x + DX[d], y + DY[d], s, hk, POWDER_INTO) !== BLOCKED) return;
  const side = Math.random() < 0.5 ? 1 : 7;
  const d1 = (d + side) % 8;
  const d2 = (d + 8 - side) % 8;
  if (tryMove(g, i, x + DX[d1], y + DY[d1], s, hk, POWDER_INTO) !== BLOCKED) return;
  tryMove(g, i, x + DX[d2], y + DY[d2], s, hk, POWDER_INTO);
}

function moveLiquid(g: Grid, i: number, x: number, y: number, d: number, s: number, hk: StepHooks): void {
  if (tryMove(g, i, x + DX[d], y + DY[d], s, hk, LIQUID_INTO) !== BLOCKED) return;
  // Seep through filter paper: hop over the filter cell if the cell beyond is free.
  const fx = x + DX[d];
  const fy = y + DY[d];
  if (g.inside(fx, fy) && g.kind[fy * g.w + fx] === FILTER && Math.random() < (hk.filterRate ?? 0.05)) {
    const bx = fx + DX[d];
    const by = fy + DY[d];
    if (!g.inside(bx, by)) {
      if (hk.exit && hk.exit(i, bx, by)) return;
    } else if (g.kind[by * g.w + bx] === EMPTY) {
      g.swap(i, by * g.w + bx);
      g.stamp[by * g.w + bx] = s;
      return;
    }
  }
  const side = Math.random() < 0.5 ? 1 : 7;
  const d1 = (d + side) % 8;
  const d2 = (d + 8 - side) % 8;
  if (tryMove(g, i, x + DX[d1], y + DY[d1], s, hk, LIQUID_INTO) !== BLOCKED) return;
  if (tryMove(g, i, x + DX[d2], y + DY[d2], s, hk, LIQUID_INTO) !== BLOCKED) return;
  // Flow sideways (perpendicular to gravity).
  const sd = (d + (Math.random() < 0.5 ? 2 : 6)) % 8;
  let cx = x;
  let cy = y;
  let ci = i;
  for (let step = 0; step < DISPERSION; step++) {
    if (tryMove(g, ci, cx + DX[sd], cy + DY[sd], s, hk, LIQUID_INTO) !== FREE) return;
    cx += DX[sd];
    cy += DY[sd];
    ci = cy * g.w + cx;
    // Stop spreading as soon as it can fall again.
    const fx2 = cx + DX[d];
    const fy2 = cy + DY[d];
    if (g.inside(fx2, fy2) && g.kind[fy2 * g.w + fx2] === EMPTY) return;
  }
}

function moveGas(g: Grid, i: number, x: number, y: number, up: number, s: number, hk: StepHooks): void {
  const r = Math.random();
  const d = r < 0.6 ? up : r < 0.8 ? (up + 1) % 8 : (up + 7) % 8;
  if (tryMove(g, i, x + DX[d], y + DY[d], s, hk, GAS_INTO) !== BLOCKED) return;
  const sd = (up + (Math.random() < 0.5 ? 2 : 6)) % 8;
  tryMove(g, i, x + DX[sd], y + DY[sd], s, hk, B(K.Empty));
}

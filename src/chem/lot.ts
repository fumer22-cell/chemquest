import { POWDER_PACKING, VOL_PER_PX } from '../config';
import { substance } from '../data/substances';

export type LotPhase = 'liquid' | 'solid' | 'gas';

/**
 * A "lot" is an exact amount of material (moles of each substance) in one phase.
 * Each container owns a liquid lot and a solid lot; every pixel of liquid in the
 * container is a share of that lot. A pixel travelling through the air (a pour
 * stream, a drop, a puff of steam) carries its own small lot, called a parcel.
 */
export class Lot {
  readonly n = new Map<string, number>();
  /** Number of pixels currently drawing this lot (maintained by the grids). */
  px = 0;
  /** Bumped on every change, for colour caching. */
  version = 0;
  private colorCache: { v: number; rgba: [number, number, number, number] } | null = null;

  constructor(
    public id: number,
    public phase: LotPhase,
  ) {}

  mol(id: string): number {
    return this.n.get(id) ?? 0;
  }

  grams(id: string): number {
    return this.mol(id) * substance(id).mw;
  }

  totalGrams(): number {
    let g = 0;
    for (const [id, m] of this.n) g += m * substance(id).mw;
    return g;
  }

  ids(): string[] {
    return [...this.n.keys()];
  }

  isEmpty(): boolean {
    return this.n.size === 0;
  }

  add(id: string, mol: number): void {
    if (!(mol > 0)) return;
    substance(id);
    this.n.set(id, this.mol(id) + mol);
    this.version++;
  }

  addGrams(id: string, g: number): void {
    this.add(id, g / substance(id).mw);
  }

  /** Remove up to `mol`; returns amount removed. */
  remove(id: string, mol: number): number {
    const have = this.mol(id);
    const take = Math.min(have, Math.max(0, mol));
    const left = have - take;
    if (left <= 1e-12) this.n.delete(id);
    else this.n.set(id, left);
    this.version++;
    return take;
  }

  /** True volume in mL (ideal mixing). Powders use their loose bulk volume. */
  volumeML(): number {
    let v = 0;
    for (const [id, m] of this.n) {
      const s = substance(id);
      v += (m * s.mw) / s.density;
    }
    return this.phase === 'solid' ? v / POWDER_PACKING : v;
  }

  /** Heat capacity in J/K. */
  heatCapacity(): number {
    let c = 0;
    for (const [id, m] of this.n) {
      const s = substance(id);
      c += m * s.mw * s.cp;
    }
    return c;
  }

  massFraction(id: string): number {
    const t = this.totalGrams();
    return t > 0 ? this.grams(id) / t : 0;
  }

  /** Mole-fraction-weighted boiling point of the volatile components, or null. */
  boilingPoint(): number | null {
    let num = 0;
    let den = 0;
    for (const [id, m] of this.n) {
      const bp = substance(id).bp;
      if (bp === null || substance(id).phase !== 'liquid') continue;
      num += m * bp;
      den += m;
    }
    return den > 0 ? num / den : null;
  }

  /** Mass-weighted latent heat of the volatile part (J/g). */
  latentHeat(): number {
    let num = 0;
    let den = 0;
    for (const [id, m] of this.n) {
      const s = substance(id);
      if (!s.latent) continue;
      num += m * s.mw * s.latent;
      den += m * s.mw;
    }
    return den > 0 ? num / den : 2000;
  }

  /** Move everything from `other` into this lot (other is emptied). */
  mergeFrom(other: Lot): void {
    if (other === this) return;
    for (const [id, m] of other.n) this.add(id, m);
    other.n.clear();
    other.version++;
  }

  /** Move a fraction (0..1) of every component into `into`. */
  moveFraction(f: number, into: Lot): void {
    const k = Math.min(1, Math.max(0, f));
    for (const [id, m] of [...this.n]) into.add(id, this.remove(id, m * k));
  }

  /** Fraction of this lot that one pixel represents. */
  pixelShare(): number {
    const v = this.volumeML();
    return v > 0 ? Math.min(1, VOL_PER_PX / v) : 1;
  }

  /**
   * Take out ~`volML` of vapour at temperature `tC`. More volatile components
   * (lower boiling point) are enriched in the vapour.
   */
  extractVapor(volML: number, tC: number, into: Lot): void {
    const weights: [string, number][] = [];
    let total = 0;
    let molSum = 0;
    for (const [id, m] of this.n) if (substance(id).bp !== null && substance(id).phase === 'liquid') molSum += m;
    if (molSum <= 0) return;
    for (const [id, m] of this.n) {
      const s = substance(id);
      if (s.bp === null || s.phase !== 'liquid') continue;
      const w = (m / molSum) * Math.exp((tC - s.bp) / 15);
      weights.push([id, w]);
      total += w;
    }
    for (const [id, w] of weights) {
      const s = substance(id);
      const vol = (volML * w) / total;
      into.add(id, this.remove(id, (vol * s.density) / s.mw));
    }
  }

  /** Display colour [r,g,b,a] with a in 0..1. */
  rgba(): [number, number, number, number] {
    if (this.colorCache && this.colorCache.v === this.version) return this.colorCache.rgba;
    const total = this.totalGrams();
    let r = 0;
    let g = 0;
    let b = 0;
    let wsum = 0;
    let tint = 0;
    for (const [id, m] of this.n) {
      const s = substance(id);
      const f = total > 0 ? (m * s.mw) / total : 0;
      const w = this.phase === 'solid' ? f * (1 + s.alpha * 4) : f * s.alpha;
      r += s.color[0] * w;
      g += s.color[1] * w;
      b += s.color[2] * w;
      wsum += w;
      tint += w;
    }
    let rgba: [number, number, number, number];
    if (wsum <= 0) rgba = this.phase === 'solid' ? [240, 240, 240, 1] : [200, 220, 240, 0.35];
    else if (this.phase === 'solid') rgba = [r / wsum, g / wsum, b / wsum, 1];
    else if (this.phase === 'gas') rgba = [235, 240, 245, 0.45];
    else rgba = [r / wsum, g / wsum, b / wsum, Math.min(0.92, 0.42 + tint * 0.6)];
    this.colorCache = { v: this.version, rgba };
    return rgba;
  }
}

/** Registry so grids can store a small integer per pixel. */
const lots: (Lot | undefined)[] = [undefined]; // id 0 = none
const free: number[] = [];

export function newLot(phase: LotPhase): Lot {
  const id = free.pop() ?? lots.length;
  const lot = new Lot(id, phase);
  lots[id] = lot;
  return lot;
}

export function getLot(id: number): Lot {
  const l = lots[id];
  if (!l) throw new Error(`Lot ${id} does not exist`);
  return l;
}

export function freeLot(lot: Lot): void {
  if (lots[lot.id] === lot) {
    lots[lot.id] = undefined;
    free.push(lot.id);
  }
}

export function liveLotCount(): number {
  return lots.filter(Boolean).length;
}

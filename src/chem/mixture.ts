import { AMBIENT_K, EPS } from './constants';
import { getSubstance } from './registry';

/**
 * The true contents of a container. Everything is stored in moles; grams, mL,
 * molarity and pH are derived. The player never sees this directly — only
 * instrument readings (see instruments.ts).
 *
 * Model (intro-level, ideal):
 *  - Water is the only solvent. A solute dissolves up to its solubility limit
 *    (g per 100 g water); the rest stays as undissolved solid (or escapes, for gases).
 *  - Volume = liquids + undissolved solids (by density). Dissolved solutes add no volume.
 *  - Heat of solution is applied whenever the dissolved amount changes (settle()).
 */
export class Mixture {
  private n = new Map<string, number>();
  /** Dissolved moles at the last settle(), used to compute heat of solution. */
  private dissolvedRec = new Map<string, number>();
  temperatureK: number = AMBIENT_K;

  /** Build a mixture already at equilibrium (no dissolving heat), e.g. a stock bottle. */
  static of(amounts: Record<string, number>, temperatureK = AMBIENT_K): Mixture {
    const m = new Mixture();
    for (const [id, mol] of Object.entries(amounts)) m.add(id, mol);
    m.temperatureK = temperatureK;
    m.settle(false);
    return m;
  }

  /** Same as of() but amounts are given in grams. */
  static ofMasses(masses: Record<string, number>, temperatureK = AMBIENT_K): Mixture {
    const mol: Record<string, number> = {};
    for (const [id, g] of Object.entries(masses)) mol[id] = g / getSubstance(id).molarMass;
    return Mixture.of(mol, temperatureK);
  }

  add(id: string, mol: number): void {
    if (!(mol > 0)) return;
    getSubstance(id); // validate
    this.n.set(id, (this.n.get(id) ?? 0) + mol);
  }

  /** Remove up to `mol`; returns the amount actually removed. */
  remove(id: string, mol: number): number {
    const have = this.n.get(id) ?? 0;
    const take = Math.min(have, Math.max(0, mol));
    const left = have - take;
    if (left <= EPS) this.n.delete(id);
    else this.n.set(id, left);
    return take;
  }

  moles(id: string): number {
    return this.n.get(id) ?? 0;
  }

  ids(): string[] {
    return [...this.n.entries()].filter(([, v]) => v > EPS).map(([k]) => k);
  }

  isEmpty(): boolean {
    return this.ids().length === 0;
  }

  /** Snapshot of all amounts in moles. */
  amounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const id of this.ids()) out[id] = this.moles(id);
    return out;
  }

  massOf(id: string): number {
    return this.moles(id) * getSubstance(id).molarMass;
  }

  totalMass(): number {
    return this.ids().reduce((s, id) => s + this.massOf(id), 0);
  }

  waterMoles(): number {
    return this.moles('H2O');
  }

  waterMass(): number {
    return this.massOf('H2O');
  }

  /** Max moles of `id` the water present can hold. */
  capacity(id: string): number {
    const s = getSubstance(id);
    if (id === 'H2O' || !s.solubility) return 0;
    return ((s.solubility / 100) * this.waterMass()) / s.molarMass;
  }

  dissolvedMoles(id: string): number {
    return Math.min(this.moles(id), this.capacity(id));
  }

  undissolvedMoles(id: string): number {
    return this.moles(id) - this.dissolvedMoles(id);
  }

  /** Volume of liquid only (water + other liquids), mL. Used for concentration. */
  liquidVolumeML(): number {
    let v = 0;
    for (const id of this.ids()) {
      const s = getSubstance(id);
      if (s.state === 'liquid') v += this.massOf(id) / (s.density ?? 1);
    }
    return v;
  }

  /** Total occupied volume (liquid + undissolved solids), mL. What a graduated cylinder shows. */
  volumeML(): number {
    let v = this.liquidVolumeML();
    for (const id of this.ids()) {
      const s = getSubstance(id);
      if (s.state === 'solid') {
        v += (this.undissolvedMoles(id) * s.molarMass) / (s.density ?? 2);
      }
    }
    return v;
  }

  /** Concentration of dissolved `id`, mol/L. */
  molarity(id: string): number {
    const vL = this.liquidVolumeML() / 1000;
    return vL > EPS ? this.dissolvedMoles(id) / vL : 0;
  }

  /** Heat capacity of the contents, J/K. */
  heatCapacity(): number {
    return this.ids().reduce((s, id) => s + this.moles(id) * getSubstance(id).cp, 0);
  }

  /** Add heat (J, negative to remove). `extraC` is the container's own heat capacity. */
  addHeat(joules: number, extraC = 0): void {
    const c = this.heatCapacity() + extraC;
    if (c > EPS) this.temperatureK += joules / c;
  }

  /**
   * Bring dissolved amounts up to date. Returns heat released (J, positive = warms).
   * With applyHeat=false the amounts are updated silently (used for stock bottles).
   */
  settle(applyHeat = true, extraC = 0): number {
    let q = 0;
    const ids = new Set([...this.n.keys(), ...this.dissolvedRec.keys()]);
    for (const id of ids) {
      const now = this.dissolvedMoles(id);
      const before = this.dissolvedRec.get(id) ?? 0;
      const dH = getSubstance(id).heatOfSolution ?? 0;
      q += -(now - before) * dH * 1000;
      if (now > EPS) this.dissolvedRec.set(id, now);
      else this.dissolvedRec.delete(id);
    }
    if (applyHeat && q !== 0) this.addHeat(q, extraC);
    return q;
  }

  /** Remove and return undissolved gases (they escape from an open vessel). */
  removeGases(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const id of this.ids()) {
      if (getSubstance(id).state !== 'gas') continue;
      const free = this.undissolvedMoles(id);
      if (free > EPS) out[id] = this.remove(id, free);
    }
    return out;
  }

  /** Remove a fraction (0..1) of everything and return it as a new mixture. */
  take(fraction: number): Mixture {
    const f = Math.min(1, Math.max(0, fraction));
    const out = new Mixture();
    out.temperatureK = this.temperatureK;
    for (const id of this.ids()) out.add(id, this.remove(id, this.moles(id) * f));
    for (const [id, d] of [...this.dissolvedRec]) {
      out.dissolvedRec.set(id, d * f);
      this.dissolvedRec.set(id, d * (1 - f));
    }
    if (f >= 1) {
      this.n.clear();
      this.dissolvedRec.clear();
    }
    return out;
  }

  takeMass(grams: number): Mixture {
    const m = this.totalMass();
    return this.take(m > EPS ? grams / m : 0);
  }

  takeVolume(mL: number): Mixture {
    const v = this.volumeML();
    return this.take(v > EPS ? mL / v : 0);
  }

  /** Mix `other` into this one (other is emptied). Temperatures mix by heat capacity. */
  merge(other: Mixture, extraC = 0): void {
    const c1 = this.heatCapacity() + extraC;
    const c2 = other.heatCapacity();
    if (c1 + c2 > EPS) {
      this.temperatureK = (c1 * this.temperatureK + c2 * other.temperatureK) / (c1 + c2);
    }
    for (const id of other.ids()) this.add(id, other.moles(id));
    for (const [id, d] of other.dissolvedRec) {
      this.dissolvedRec.set(id, (this.dissolvedRec.get(id) ?? 0) + d);
    }
    other.n.clear();
    other.dissolvedRec.clear();
  }

  clear(): void {
    this.n.clear();
    this.dissolvedRec.clear();
    this.temperatureK = AMBIENT_K;
  }

  clone(): Mixture {
    const m = new Mixture();
    this.n.forEach((v, k) => m.n.set(k, v));
    this.dissolvedRec.forEach((v, k) => m.dissolvedRec.set(k, v));
    m.temperatureK = this.temperatureK;
    return m;
  }
}

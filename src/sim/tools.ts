import { VOL_PER_PX } from '../config';
import { freeLot, newLot, type Lot } from '../chem/lot';
import { K } from './grid';
import type { World } from './world';

export type ToolKind = 'pipette' | 'rod' | 'spatula';

/**
 * Hand tools. Unlike glassware they stay where you leave them (think of them
 * as resting in a clamp or across the rim), and their tip is what matters.
 */
export class Tool {
  held = false;
  /** Pipette contents. */
  readonly lot: Lot | null;
  /** Pipette capacity (mL). */
  readonly capacityML = 1.5;
  private lastTip: [number, number] = [0, 0];
  label: string;

  constructor(
    readonly kind: ToolKind,
    /** Top of the tool (world px). The tip is `length` px below. */
    public x: number,
    public y: number,
    label?: string,
  ) {
    this.lot = kind === 'pipette' ? newLot('liquid') : kind === 'spatula' ? newLot('solid') : null;
    this.label = label ?? (kind === 'pipette' ? 'Pasteur pipette' : kind === 'spatula' ? 'Spatula' : 'Glass stirring rod');
  }

  get length(): number {
    return this.kind === 'pipette' ? 24 : this.kind === 'spatula' ? 22 : 30;
  }

  /** Spatula: grams of solid it can carry in one scoop. */
  readonly scoopG = 0.6;

  tip(): [number, number] {
    return [this.x, this.y + this.length];
  }

  hit(wx: number, wy: number): boolean {
    return Math.abs(wx - this.x) <= 2.5 && wy >= this.y - 1 && wy <= this.y + this.length + 1;
  }

  /** Volume held (mL). */
  volumeML(): number {
    return this.lot?.volumeML() ?? 0;
  }

  /**
   * Pipette action: if the tip is in a liquid and there is room, fill;
   * otherwise squeeze out one drop. Returns a short description.
   */
  act(world: World, fine = false): string {
    if (!this.lot) return '';
    if (this.kind === 'spatula') return this.scoop(world, fine);
    const [tx, ty] = this.tip();
    const c = world.containerAt(tx, ty);
    if (c && this.volumeML() < this.capacityML - 0.01) {
      const li = c.cellAt(tx, ty);
      const { kind, w } = c.grid;
      let wet = false;
      for (let dy = -1; dy <= 2 && !wet; dy++) {
        for (let dx = -1; dx <= 1 && !wet; dx++) {
          const j = li + dy * w + dx;
          if (j >= 0 && j < kind.length && kind[j] === K.Liquid) wet = true;
        }
      }
      if (wet && c.liquid.volumeML() > 0) {
        const want = Math.min(this.capacityML - this.volumeML(), c.liquid.volumeML());
        c.liquid.moveFraction(want / c.liquid.volumeML(), this.lot);
        return 'fill';
      }
    }
    if (this.volumeML() <= 1e-6) return 'empty';
    const drop = newLot('liquid');
    this.lot.moveFraction(Math.min(1, VOL_PER_PX / this.volumeML()), drop);
    for (const dy of [1, 0, 2, 3]) {
      if (world.release(tx, ty + dy, K.Liquid, drop, 22)) return 'drop';
    }
    this.lot.mergeFrom(drop);
    freeLot(drop);
    return 'blocked';
  }

  /** Spatula: scoop up crystals at the tip (a pinch if `fine`), or tip the scoop out. */
  private scoop(world: World, fine: boolean): string {
    const lot = this.lot!;
    const [tx, ty] = this.tip();
    if (lot.isEmpty()) {
      const c = world.containerAt(tx, ty);
      if (!c || c.solid.totalGrams() <= 0) return 'empty';
      const li = c.cellAt(tx, ty);
      const { kind, w } = c.grid;
      let near = false;
      for (let dy = -2; dy <= 3 && !near; dy++) {
        for (let dx = -2; dx <= 2 && !near; dx++) {
          const j = li + dy * w + dx;
          if (j >= 0 && j < kind.length && kind[j] === K.Powder) near = true;
        }
      }
      if (!near) return 'empty';
      c.solid.moveFraction(Math.min(1, (fine ? 0.02 : this.scoopG) / c.solid.totalGrams()), lot);
      return 'fill';
    }
    // Tip it out, one grain-pixel at a time, around the tip.
    let placed = 0;
    for (let n = 0; n < 400 && !lot.isEmpty(); n++) {
      const grain = newLot('solid');
      lot.moveFraction(lot.pixelShare(), grain);
      const ox = ((n % 5) - 2) * 1;
      const oy = Math.floor(n / 5) % 6;
      if (world.release(tx + ox, ty + 1 + oy, K.Powder, grain, 22)) placed++;
      else {
        lot.mergeFrom(grain);
        freeLot(grain);
      }
    }
    return placed ? 'drop' : 'blocked';
  }

  /** Rod: stirring and scratching whatever container its tip is in. */
  update(world: World): void {
    const [tx, ty] = this.tip();
    const moved = Math.hypot(tx - this.lastTip[0], ty - this.lastTip[1]);
    this.lastTip = [tx, ty];
    if (this.kind !== 'rod' || !this.held) return;
    const c = world.containerAt(tx, ty);
    if (!c) return;
    const li = c.cellAt(tx, ty);
    if (li < 0 || c.grid.kind[li] === K.Wall) return;
    c.chem.stir = Math.min(1, c.chem.stir + moved * 0.08);
    // Scratching: the tip moving against the glass.
    const { kind, w } = c.grid;
    const touching = [li - 1, li + 1, li + w, li - w].some((j) => j >= 0 && j < kind.length && kind[j] === K.Wall);
    if (touching && moved > 0.3) c.chem.scratch = 30;
  }
}

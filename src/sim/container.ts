import { AMBIENT_C, VOL_PER_PX } from '../config';
import { freeLot, getLot, newLot, type Lot } from '../chem/lot';
import type { GlasswareDef } from '../data/glassware';
import { CELL, Grid, K } from './grid';

const { EMPTY, GAS, LIQUID, POWDER, WALL } = CELL;
import { simEvents } from './events';
import { conductHeat } from './heat';
import { stepGrid } from './physics';
import { M_FILTER, M_IN, M_WALL, type Shape } from './shapes';

let nextId = 1;

/** What the container needs from the world it lives in. */
export interface ContainerHost {
  /** A particle left this container's grid at local (nx, ny). Return true if the world took it. */
  emit(c: Container, i: number, nx: number, ny: number): boolean;
}

/**
 * A piece of glassware with its own local particle grid. Tilting rotates the
 * sprite and the direction of gravity inside the grid.
 */
export class Container {
  readonly id = nextId++;
  readonly grid: Grid;
  readonly shape: Shape;
  readonly interior: Int32Array;
  /** Wall cells in the bottom row (heated by a hot plate). */
  readonly bottomWalls: Int32Array;
  readonly liquid: Lot;
  readonly solid: Lot;
  /** World position of the pivot (grid centre). */
  x = 0;
  y = 0;
  angle = 0;
  /** Player is holding it. */
  held = false;
  /** Player is actively tilting it (holding the tilt control). */
  tilting = false;
  vy = 0;
  /** Equipment id it is resting on, if any. */
  restOn: string | null = null;
  label: string;
  /** Colour of the paper label on stock bottles. */
  tag: [number, number, number] | null = null;
  /** Mean temperature of contents (°C), refreshed every tick. */
  tempC = AMBIENT_C;
  /** Filter seep probability (Büchner with vacuum). */
  filterRate = 0.05;
  /** Stock-bottle supply volume kept topped up in the visible pixels. */
  reservoir: boolean;
  private tick = 0;

  constructor(
    readonly def: GlasswareDef,
    x: number,
    y: number,
    label?: string,
  ) {
    this.shape = def.make();
    this.label = label ?? def.name;
    this.reservoir = !!def.reservoir;
    const { w, h, mask } = this.shape;
    this.grid = new Grid(w, h);
    const inside: number[] = [];
    const bottom: number[] = [];
    for (let i = 0; i < w * h; i++) {
      const m = mask[i];
      this.grid.kind[i] = m === M_WALL ? K.Wall : m === M_IN ? K.Empty : m === M_FILTER ? K.Filter : K.Void;
      if (m === M_IN) inside.push(i);
    }
    // Lowest wall cell in each column = what touches a hot plate.
    for (let x0 = 0; x0 < w; x0++) {
      for (let y0 = h - 1; y0 >= 0; y0--) {
        if (mask[y0 * w + x0] === M_WALL) {
          bottom.push(y0 * w + x0);
          break;
        }
      }
    }
    this.interior = Int32Array.from(inside);
    this.bottomWalls = Int32Array.from(bottom);
    this.liquid = newLot('liquid');
    this.solid = newLot('solid');
    this.x = x;
    this.y = y;
  }

  // ---------- geometry ----------

  get pivotX(): number {
    return this.shape.w / 2;
  }

  get pivotY(): number {
    return this.shape.h / 2;
  }

  /** World y of the container's base when upright. */
  get bottomY(): number {
    return this.y + this.shape.h - this.pivotY;
  }

  private trigA = NaN;
  private cosA = 1;
  private sinA = 0;

  /** cos/sin of the current angle, cached. */
  trig(): [number, number] {
    if (this.angle !== this.trigA) {
      this.trigA = this.angle;
      this.cosA = Math.cos(this.angle);
      this.sinA = Math.sin(this.angle);
    }
    return [this.cosA, this.sinA];
  }

  localToWorld(lx: number, ly: number): [number, number] {
    const [c, s] = this.trig();
    const dx = lx - this.pivotX;
    const dy = ly - this.pivotY;
    return [this.x + dx * c - dy * s, this.y + dx * s + dy * c];
  }

  worldToLocal(wx: number, wy: number): [number, number] {
    const [c, s] = this.trig();
    const dx = wx - this.x;
    const dy = wy - this.y;
    return [dx * c + dy * s + this.pivotX, -dx * s + dy * c + this.pivotY];
  }

  /** Local cell index under a world point, or -1. */
  cellAt(wx: number, wy: number): number {
    const [lx, ly] = this.worldToLocal(wx, wy);
    const x = Math.floor(lx);
    const y = Math.floor(ly);
    if (x < 0 || y < 0 || x >= this.shape.w || y >= this.shape.h) return -1;
    return y * this.shape.w + x;
  }

  /** Is the world point on this container (glass or inside)? */
  hit(wx: number, wy: number): boolean {
    const i = this.cellAt(wx, wy);
    return i >= 0 && this.grid.kind[i] !== K.Void;
  }

  /** Axis-aligned world bounding box of the rotated grid. */
  bounds(): [number, number, number, number] {
    const pts = [
      this.localToWorld(0, 0),
      this.localToWorld(this.shape.w, 0),
      this.localToWorld(0, this.shape.h),
      this.localToWorld(this.shape.w, this.shape.h),
    ];
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return [Math.floor(Math.min(...xs)), Math.floor(Math.min(...ys)), Math.ceil(Math.max(...xs)), Math.ceil(Math.max(...ys))];
  }

  // ---------- amounts ----------

  /** Volume of liquid + undissolved solid (mL). */
  contentsML(): number {
    return this.liquid.volumeML() + this.solid.volumeML();
  }

  /** Mass on a balance (g). */
  grossMass(): number {
    return this.def.glassMassG + this.liquid.totalGrams() + this.solid.totalGrams();
  }

  heatCapacity(): number {
    return this.liquid.heatCapacity() + this.solid.heatCapacity() + this.def.glassMassG * 0.84;
  }

  /** Add (or remove) heat in joules, spread over contents and glass. */
  addHeat(joules: number): void {
    const dT = joules / Math.max(1, this.heatCapacity());
    const { kind, temp } = this.grid;
    for (let i = 0; i < kind.length; i++) {
      const k = kind[i];
      if (k === K.Liquid || k === K.Powder || k === K.Wall) temp[i] += dT;
    }
  }

  /** Fill with a lot's worth of material immediately (used for setup). */
  fill(lot: Lot, phase: 'liquid' | 'solid', tempC = AMBIENT_C): void {
    (phase === 'liquid' ? this.liquid : this.solid).mergeFrom(lot);
    freeLot(lot);
    for (let n = 0; n < 20000 && this.reconcileOnce(tempC); n++);
  }

  // ---------- heat sources ----------

  /** Hot plate contact: pull the bottom glass toward `tempC`. */
  heatBottom(tempC: number, rate: number): void {
    const t = this.grid.temp;
    for (const i of this.bottomWalls) t[i] += (tempC - t[i]) * rate;
  }

  /** Bath: pull all glass below world height `levelY` toward `tempC`. */
  immerse(levelY: number, tempC: number, rate: number): void {
    const { kind, temp, w } = this.grid;
    const [c, s] = this.trig();
    const px = this.pivotX;
    const py = this.pivotY;
    for (let i = 0; i < kind.length; i++) {
      if (kind[i] !== K.Wall) continue;
      const wy = this.y + ((i % w) + 0.5 - px) * s + (Math.floor(i / w) + 0.5 - py) * c;
      if (wy >= levelY) temp[i] += (tempC - temp[i]) * rate;
    }
  }

  // ---------- simulation ----------

  update(host: ContainerHost): void {
    this.tick++;
    const g = this.grid;
    const gx = Math.sin(this.angle);
    const gy = Math.cos(this.angle);
    stepGrid(g, gx, gy, {
      exit: (i, nx, ny) => host.emit(this, i, nx, ny),
      filterRate: this.filterRate,
    });
    conductHeat(g, AMBIENT_C);
    this.mixAndPhase();
    if (this.tick % 2 === 0) for (let n = 0; n < 6 && this.reconcileOnce(this.tempC); n++);
  }

  /**
   * Convection (liquid temperatures drift toward their mean), boiling,
   * evaporation and condensation.
   */
  private mixAndPhase(): void {
    const g = this.grid;
    const { kind, temp, w } = g;
    let sum = 0;
    let n = 0;
    let lsum = 0;
    let ln = 0;
    for (const i of this.interior) {
      const k = kind[i];
      if (k === LIQUID) {
        lsum += temp[i];
        ln++;
      }
      if (k === LIQUID || k === POWDER) {
        sum += temp[i];
        n++;
      }
    }
    if (n) this.tempC = sum / n;
    else {
      let ws = 0;
      for (const i of this.bottomWalls) ws += temp[i];
      this.tempC = ws / Math.max(1, this.bottomWalls.length);
    }
    const lmean = ln ? lsum / ln : 0;
    const bp = this.liquid.boilingPoint();
    const latentC = this.liquid.latentHeat() / 4.18; // °C-equivalent per pixel
    const gx = Math.sin(this.angle);
    const gy = Math.cos(this.angle);
    const ux = -Math.round(gx);
    const uy = -Math.round(gy);

    for (const i of this.interior) {
      const k = kind[i];
      if (k === LIQUID) {
        temp[i] += (lmean - temp[i]) * 0.04; // convection
        if (bp === null) continue;
        if (temp[i] > bp) {
          // Boil: excess heat turns this pixel into vapour (probabilistically, by latent heat).
          if (Math.random() < (temp[i] - bp) / latentC) this.vaporise(i, temp[i]);
          else temp[i] = bp + Math.min(2, temp[i] - bp);
        } else if (temp[i] > bp - 45) {
          // Gentle evaporation from the surface.
          const x = i % w;
          const y = (i / w) | 0;
          const ax = x + ux;
          const ay = y + uy;
          if (g.inside(ax, ay) && kind[ay * w + ax] === EMPTY && Math.random() < 0.0004 * Math.exp((temp[i] - bp) / 9)) {
            this.vaporise(i, temp[i]);
          }
        }
      } else if (k === GAS) {
        const parcel = getLot(g.lot[i]);
        const pbp = parcel.boilingPoint() ?? -999;
        if (temp[i] < pbp - 3 && Math.random() < 0.08 && this.touchesCold(i)) {
          // Condense back into the liquid.
          this.liquid.mergeFrom(parcel);
          g.retag(i, K.Liquid, this.liquid.id);
          freeLot(parcel);
        }
      }
    }
  }

  private touchesCold(i: number): boolean {
    const { kind, w, h } = this.grid;
    const x = i % w;
    const y = (i / w) | 0;
    const n = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    return n.some((j) => j >= 0 && (kind[j] === WALL || kind[j] === LIQUID));
  }

  private vaporise(i: number, tC: number): void {
    const parcel = newLot('gas');
    this.liquid.extractVapor(VOL_PER_PX, tC, parcel);
    if (parcel.isEmpty()) {
      freeLot(parcel);
      return;
    }
    this.grid.retag(i, K.Gas, parcel.id);
    simEvents.bubble++;
    const bp = parcel.boilingPoint();
    if (bp !== null) this.grid.temp[i] = Math.max(bp, tC);
  }

  /**
   * Make the number of liquid/powder pixels match the exact amounts in the
   * lots (they change when things dissolve, crystallise, react or evaporate).
   * Does one adjustment; returns false when nothing needed changing.
   */
  reconcileOnce(tempC: number): boolean {
    const want = (lot: Lot) => Math.round(lot.volumeML() / VOL_PER_PX);
    const liqDiff = want(this.liquid) - this.liquid.px;
    const solDiff = want(this.solid) - this.solid.px;
    const reservoirFull = this.reservoir && this.freeInterior() === 0;
    if (this.reservoir && liqDiff > 0 && reservoirFull) return false;

    if (solDiff < 0 && liqDiff > 0) return this.convert(K.Powder, K.Liquid, true);
    if (solDiff > 0 && liqDiff < 0) return this.convert(K.Liquid, K.Powder, false);
    if (solDiff < 0) return this.removeOne(K.Powder);
    if (liqDiff < 0) return this.removeOne(K.Liquid);
    if (solDiff > 0) return this.spawn(K.Powder, tempC);
    if (liqDiff > 0) return this.spawn(K.Liquid, tempC);
    return false;
  }

  freeInterior(): number {
    let c = 0;
    for (const i of this.interior) if (this.grid.kind[i] === K.Empty) c++;
    return c;
  }

  private sample(pred: (i: number) => boolean, tries = 400): number {
    const n = this.interior.length;
    for (let t = 0; t < tries; t++) {
      const i = this.interior[(Math.random() * n) | 0];
      if (pred(i)) return i;
    }
    for (const i of this.interior) if (pred(i)) return i;
    return -1;
  }

  private neighbours(i: number, k: K): boolean {
    const { kind, w, h } = this.grid;
    const x = i % w;
    const y = (i / w) | 0;
    return (
      (x > 0 && kind[i - 1] === k) || (x < w - 1 && kind[i + 1] === k) || (y > 0 && kind[i - w] === k) || (y < h - 1 && kind[i + w] === k)
    );
  }

  private convert(from: K, to: K, needContact: boolean): boolean {
    const kind = this.grid.kind;
    const i = this.sample((j) => kind[j] === from && (!needContact || this.neighbours(j, to)));
    if (i < 0) return false;
    this.grid.retag(i, to, to === K.Liquid ? this.liquid.id : this.solid.id);
    return true;
  }

  private removeOne(k: K): boolean {
    const kind = this.grid.kind;
    let i = this.sample((j) => kind[j] === k && (this.neighbours(j, K.Empty) || this.neighbours(j, K.Gas)));
    if (i < 0) i = this.sample((j) => kind[j] === k);
    if (i < 0) return false;
    this.grid.clear(i);
    return true;
  }

  private spawn(k: K, tempC: number): boolean {
    const kind = this.grid.kind;
    // Prefer a free cell next to the same material, so the pile/pool grows.
    let i = this.sample((j) => kind[j] === K.Empty && this.neighbours(j, k));
    if (i < 0) i = this.sample((j) => kind[j] === K.Empty);
    if (i < 0) return false;
    this.grid.put(i, k, k === K.Liquid ? this.liquid.id : this.solid.id, tempC);
    return true;
  }

  dispose(): void {
    const { kind, lot } = this.grid;
    for (let i = 0; i < kind.length; i++) {
      if (kind[i] === K.Gas) {
        const id = lot[i];
        this.grid.clear(i);
        freeLot(getLot(id));
      } else if (kind[i] === K.Liquid || kind[i] === K.Powder) this.grid.clear(i);
    }
    freeLot(this.liquid);
    freeLot(this.solid);
  }
}

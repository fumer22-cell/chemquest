import { AMBIENT_C } from '../config';
import { getLot } from '../chem/lot';

/** What occupies a cell. */
export const enum K {
  Empty = 0,
  /** Glass or any static solid. */
  Wall = 1,
  /** Outside the container shape (never occupied). */
  Void = 2,
  Powder = 3,
  Liquid = 4,
  Gas = 5,
  /** Filter paper: liquid seeps through, powder and gas do not. */
  Filter = 6,
}

/**
 * Plain numeric copies of K for hot loops. Modules destructure this once
 * (`const { LIQUID } = CELL`) so each read is a local constant.
 */
export const CELL = { EMPTY: 0, WALL: 1, VOID: 2, POWDER: 3, LIQUID: 4, GAS: 5, FILTER: 6 } as const;

export const isMatter = (k: number) => k === 3 || k === 4 || k === 5;

/**
 * A rectangular cellular-automaton grid. Used both for each container's local
 * grid and for the shared world grid (pour streams, spills, steam).
 */
export class Grid {
  readonly kind: Uint8Array;
  readonly lot: Uint32Array;
  readonly temp: Float32Array;
  /** Per-particle random colour variation. */
  readonly shade: Uint8Array;
  /** Tick stamp so a particle moves at most once per tick. */
  readonly stamp: Uint8Array;
  /** Gas lifetime (ticks). */
  readonly life: Uint16Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    const n = w * h;
    this.kind = new Uint8Array(n);
    this.lot = new Uint32Array(n);
    this.temp = new Float32Array(n).fill(AMBIENT_C);
    this.shade = new Uint8Array(n);
    this.stamp = new Uint8Array(n);
    this.life = new Uint16Array(n);
    for (let i = 0; i < n; i++) this.shade[i] = (Math.random() * 256) | 0;
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** Place a particle (cell must be Empty). Keeps the lot's pixel count right. */
  put(i: number, kind: K, lotId: number, tempC: number): void {
    this.kind[i] = kind;
    this.lot[i] = lotId;
    this.temp[i] = tempC;
    this.life[i] = 0;
    getLot(lotId).px++;
  }

  /** Remove a particle; returns its lot id. */
  clear(i: number): number {
    const id = this.lot[i];
    if (isMatter(this.kind[i]) && id) getLot(id).px--;
    this.kind[i] = K.Empty;
    this.lot[i] = 0;
    return id;
  }

  /** Change a particle's kind/lot in place (e.g. dissolving, condensing). */
  retag(i: number, kind: K, lotId: number): void {
    const old = this.lot[i];
    if (old !== lotId) {
      if (old) getLot(old).px--;
      getLot(lotId).px++;
    }
    this.kind[i] = kind;
    this.lot[i] = lotId;
  }

  swap(i: number, j: number): void {
    let t: number = this.kind[i];
    this.kind[i] = this.kind[j];
    this.kind[j] = t;
    t = this.lot[i];
    this.lot[i] = this.lot[j];
    this.lot[j] = t;
    t = this.temp[i];
    this.temp[i] = this.temp[j];
    this.temp[j] = t;
    t = this.shade[i];
    this.shade[i] = this.shade[j];
    this.shade[j] = t;
    t = this.life[i];
    this.life[i] = this.life[j];
    this.life[j] = t;
  }

  count(kind: K): number {
    let c = 0;
    for (let i = 0; i < this.kind.length; i++) if (this.kind[i] === kind) c++;
    return c;
  }
}

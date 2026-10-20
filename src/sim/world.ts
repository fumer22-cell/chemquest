import { AMBIENT_C, WORLD_H, WORLD_W } from '../config';
import { stepKinetics, type ReactionDef } from '../chem/kinetics';
import { freeLot, getLot, newLot, type Lot } from '../chem/lot';
import { Container } from './container';
import type { Tool } from './tools';
import { simEvents } from './events';
import { CELL, Grid, K } from './grid';

const { FILTER, GAS, LIQUID, POWDER, VOID, WALL } = CELL;
import { stepGrid } from './physics';

export type EquipmentKind = 'hotplate' | 'bath' | 'balance' | 'shelf' | 'stand' | 'hood' | 'mp' | 'waste';

/** Static lab equipment that containers can rest on. */
export interface Equipment {
  id: string;
  kind: EquipmentKind;
  label: string;
  /** Footprint in world pixels; `y` is the top surface containers sit on. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Hot plate / bath: current and target temperature (°C). */
  temp: number;
  setpoint: number;
  on: boolean;
  /** Bath: world y of the water surface. */
  levelY?: number;
  /** Bath: cannot be heated (ice bath). */
  fixedTemp?: boolean;
  /** Balance: tare (g). */
  tare?: number;
  /** Text shown on the equipment's display (melting-point apparatus). */
  display?: string;
}

/** Where material went that left the glassware. */
export interface Losses {
  spilledML: number;
  vapourG: number;
  /** Poured into the waste bin on purpose. */
  wasteML: number;
}

/**
 * The bench: every container, the shared world grid for anything in the air or
 * spilled, and the equipment.
 */
export class World {
  readonly grid = new Grid(WORLD_W, WORLD_H);
  /** Per world cell: -1 open, -2 glass, k ≥ 0 inside containers[k]. */
  readonly occ = new Int32Array(WORLD_W * WORLD_H);
  containers: Container[] = [];
  equipment: Equipment[] = [];
  readonly benchY = 164;
  readonly losses: Losses = { spilledML: 0, vapourG: 0, wasteML: 0 };
  /** Lab clock (s). */
  labTime = 0;
  /** Reactions that can happen in this lab (set by the level). */
  reactions: readonly ReactionDef[] = [];
  /** Called whenever material lands in a container (before it merges). */
  onDeliver: (c: Container, parcel: Lot) => void = () => {};
  tools: Tool[] = [];

  constructor() {
    // Bench top is a static wall row.
    for (let x = 0; x < WORLD_W; x++) {
      for (let y = this.benchY; y < WORLD_H; y++) this.grid.kind[y * WORLD_W + x] = K.Wall;
    }
  }

  add(c: Container): Container {
    this.containers.push(c);
    return c;
  }

  remove(c: Container): void {
    this.containers = this.containers.filter((x) => x !== c);
    c.dispose();
  }

  equip(e: Omit<Equipment, 'temp' | 'setpoint' | 'on'> & Partial<Equipment>): Equipment {
    const full: Equipment = { temp: AMBIENT_C, setpoint: AMBIENT_C, on: false, ...e };
    this.equipment.push(full);
    return full;
  }

  equipmentById(id: string | null): Equipment | undefined {
    return id ? this.equipment.find((e) => e.id === id) : undefined;
  }

  containerAt(wx: number, wy: number): Container | null {
    for (let k = this.containers.length - 1; k >= 0; k--) if (this.containers[k].hit(wx, wy)) return this.containers[k];
    return null;
  }

  /** Bring a container to the front of the draw/hit order. */
  raise(c: Container): void {
    this.containers = [...this.containers.filter((x) => x !== c), c];
  }

  // ---------- per tick ----------

  update(dtLab: number): void {
    this.labTime += dtLab;
    this.updateEquipment(dtLab);
    this.settleContainers();
    this.separate();
    this.rasterize();
    for (const c of this.containers) {
      const e = this.equipmentById(c.restOn);
      if (e && !c.held && Math.abs(c.angle) < 0.05) {
        if (e.kind === 'hotplate' && e.on) c.heatBottom(e.temp, 0.08);
        if (e.kind === 'bath' && e.levelY !== undefined) c.immerse(e.levelY, e.temp, 0.12);
      }
      c.update(this);
      c.chem.track(c.tempC, dtLab);
      const stand = e?.kind === 'stand' && c.def.id === 'buchner' ? e : undefined;
      c.filterRate = stand?.on ? 0.6 : 0.04;
      const airflow = stand?.on && c.liquid.volumeML() < 0.05 ? 6 : 1;
      const res = stepKinetics(c.liquid, c.solid, c.tempC, dtLab, c.chem, { reactions: this.reactions, airflow });
      if (res.heatJ) c.addHeat(res.heatJ);
      this.losses.vapourG += res.driedG;
    }
    for (const t of this.tools) t.update(this);
    stepGrid(this.grid, 0, 1, {
      occ: this.occ,
      portal: (i, j, k) => this.portal(i, j, k),
      exit: (i) => {
        this.lose(i);
        return true;
      },
    });
    this.airborne();
  }

  private updateEquipment(dtLab: number): void {
    for (const e of this.equipment) {
      if (e.kind === 'hotplate') {
        const target = e.on ? e.setpoint : AMBIENT_C;
        // Plate surface heats ~4 °C/s, cools ~1 °C/s.
        const rate = target > e.temp ? 4 : 1;
        e.temp += Math.sign(target - e.temp) * Math.min(Math.abs(target - e.temp), rate * dtLab);
      } else if (e.kind === 'bath' && !e.fixedTemp) {
        const target = e.on ? e.setpoint : AMBIENT_C;
        // A water bath heats ~0.5 °C/s and cools slowly.
        const rate = target > e.temp ? 0.5 : 0.1;
        e.temp += Math.sign(target - e.temp) * Math.min(Math.abs(target - e.temp), rate * dtLab);
      }
    }
  }

  /** Containers that aren't held fall onto the nearest surface below them. */
  private settleContainers(): void {
    for (const c of this.containers) {
      if (c.held) {
        c.vy = 0;
        continue;
      }
      if (!c.tilting && c.angle !== 0) {
        const step = 0.06;
        c.angle = Math.abs(c.angle) < step ? 0 : c.angle - Math.sign(c.angle) * step;
      }
      const surf = this.surfaceBelow(c);
      if (c.bottomY < surf.y - 0.01) {
        c.vy = Math.min(c.vy + 0.25, 6);
        c.y = Math.min(c.y + c.vy, c.y + (surf.y - c.bottomY));
        c.restOn = null;
      } else {
        c.y += surf.y - c.bottomY;
        c.vy = 0;
        c.restOn = surf.id;
      }
    }
  }

  /** Push apart glassware that overlaps (nothing can occupy the same space). */
  private separate(): void {
    const cs = this.containers;
    for (let a = 0; a < cs.length; a++) {
      for (let b = a + 1; b < cs.length; b++) {
        const A = cs[a];
        const B = cs[b];
        if (A.held || B.held) continue;
        // A funnel seated on its stand sits in the neck of the flask below.
        if (this.equipmentById(A.restOn)?.kind === 'stand' || this.equipmentById(B.restOn)?.kind === 'stand') continue;
        const ox = (A.shape.w + B.shape.w) / 2 + 1 - Math.abs(A.x - B.x);
        if (ox <= 0) continue;
        const aTop = A.bottomY - A.shape.h;
        const bTop = B.bottomY - B.shape.h;
        if (A.bottomY <= bTop + 1 || B.bottomY <= aTop + 1) continue;
        const dir = A.x === B.x ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(A.x - B.x);
        const step = Math.min(ox / 2 + 0.01, 2);
        if (!A.held) A.x = Math.min(WORLD_W - A.shape.w / 2, Math.max(A.shape.w / 2, A.x + dir * step));
        if (!B.held) B.x = Math.min(WORLD_W - B.shape.w / 2, Math.max(B.shape.w / 2, B.x - dir * step));
      }
    }
  }

  /** Highest support under the container's footprint (bench if none). */
  surfaceBelow(c: Container): { y: number; id: string | null } {
    let best: { y: number; id: string | null } = { y: this.benchY, id: null };
    const half = c.shape.w / 2;
    for (const e of this.equipment) {
      if (e.kind === 'stand' && c.def.id !== 'buchner') continue;
      if (e.kind === 'hood' || e.kind === 'waste' || (e.kind === 'mp' && c.def.id !== 'watchGlass')) continue;
      const overlaps = c.x + half > e.x + 2 && c.x - half < e.x + e.w - 2;
      if (!overlaps) continue;
      // Baths: containers stand on the floor of the bath.
      const top = e.kind === 'bath' ? e.y + e.h - 3 : e.y;
      if (top >= c.bottomY - 1.01 && top < best.y) best = { y: top, id: e.id };
    }
    return best;
  }

  /** Mark which world cells are glass or the inside of a container. */
  private rasterize(): void {
    const occ = this.occ;
    occ.fill(-1);
    this.containers.forEach((c, k) => {
      const [x0, y0, x1, y1] = c.bounds();
      const { w, h } = c.shape;
      const kind = c.grid.kind;
      const [cs, sn] = c.trig();
      const px = c.pivotX;
      const py = c.pivotY;
      for (let wy = Math.max(0, y0); wy <= Math.min(WORLD_H - 1, y1); wy++) {
        for (let wx = Math.max(0, x0); wx <= Math.min(WORLD_W - 1, x1); wx++) {
          const dx = wx + 0.5 - c.x;
          const dy = wy + 0.5 - c.y;
          const x = Math.floor(dx * cs + dy * sn + px);
          const y = Math.floor(-dx * sn + dy * cs + py);
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const kk = kind[y * w + x];
          if (kk === VOID) continue;
          const j = wy * WORLD_W + wx;
          occ[j] = kk === WALL || kk === FILTER ? -2 : k;
        }
      }
    });
  }

  /** ContainerHost: a particle leaves container `c` at local (nx, ny). */
  emit(c: Container, i: number, nx: number, ny: number): boolean {
    const [wxf, wyf] = c.localToWorld(nx + 0.5, ny + 0.5);
    const wx = Math.floor(wxf);
    const wy = Math.floor(wyf);
    if (wx < 0 || wy < 0 || wx >= WORLD_W || wy >= WORLD_H) return false;
    const j = wy * WORLD_W + wx;
    const o = this.occ[j];
    const k = c.grid.kind[i];
    const t = c.grid.temp[i];
    const target = o >= 0 ? this.containers[o] : null;
    if (o === -2 || target === c) return false;
    if (!target && this.grid.kind[j] !== K.Empty) return false;
    // Straight into another container (e.g. a funnel stem inside a flask neck).
    let li = -1;
    if (target) {
      li = target.cellAt(wx + 0.5, wy + 0.5);
      if (li < 0 || target.grid.kind[li] !== K.Empty) return false;
    }
    const parcel = this.takeParcel(c, i, k);
    if (target) this.deliver(target, li, k, parcel, t);
    else this.grid.put(j, k, parcel.id, t);
    if (k !== K.Gas) simEvents.pour++;
    return true;
  }

  /** Remove the particle at container cell i and return the material it stands for. */
  private takeParcel(c: Container, i: number, k: K): Lot {
    if (k === K.Gas) {
      const id = c.grid.clear(i);
      return getLot(id);
    }
    const src = k === K.Liquid ? c.liquid : c.solid;
    const parcel = newLot(k === K.Liquid ? 'liquid' : 'solid');
    src.moveFraction(src.pixelShare(), parcel);
    c.grid.clear(i);
    return parcel;
  }

  /** Put a parcel into container `c` at local cell li. */
  deliver(c: Container, li: number, k: K, parcel: Lot, t: number): void {
    if (k === K.Gas) {
      c.grid.put(li, K.Gas, parcel.id, t);
      return;
    }
    this.onDeliver(c, parcel);
    const dst = k === K.Liquid ? c.liquid : c.solid;
    dst.mergeFrom(parcel);
    freeLot(parcel);
    c.grid.put(li, k, dst.id, t);
  }

  /**
   * Release a parcel at a world point (e.g. a drop from a pipette). If the
   * point is inside a container it goes straight in; otherwise it falls.
   * Returns false if there was no room.
   */
  release(wx: number, wy: number, kind: K, parcel: Lot, tC: number): boolean {
    const x = Math.floor(wx);
    const y = Math.floor(wy);
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return false;
    const j = y * WORLD_W + x;
    const o = this.occ[j];
    if (o >= 0) {
      const c = this.containers[o];
      const li = c.cellAt(x + 0.5, y + 0.5);
      if (li >= 0 && c.grid.kind[li] === K.Empty) {
        this.deliver(c, li, kind, parcel, tC);
        return true;
      }
      return false;
    }
    if (o === -2 || this.grid.kind[j] !== K.Empty) return false;
    this.grid.put(j, kind, parcel.id, tC);
    return true;
  }

  /** World particle i falls into container k at world cell j. */
  private portal(i: number, j: number, k: number): boolean {
    const c = this.containers[k];
    const li = c.cellAt((j % WORLD_W) + 0.5, Math.floor(j / WORLD_W) + 0.5);
    if (li < 0 || c.grid.kind[li] !== K.Empty) return false;
    const kind = this.grid.kind[i] as K;
    const t = this.grid.temp[i];
    const parcel = getLot(this.grid.clear(i));
    this.deliver(c, li, kind, parcel, t);
    return true;
  }

  /** A world particle is gone for good (off-screen or dissipated). */
  private lose(i: number): void {
    const kind = this.grid.kind[i];
    const lot = getLot(this.grid.clear(i));
    if (kind === K.Gas) this.losses.vapourG += lot.totalGrams();
    else this.losses.spilledML += lot.volumeML();
    freeLot(lot);
  }

  /** Liquid or solid that falls into a waste bin is disposed of. */
  private disposeWaste(): void {
    for (const e of this.equipment) {
      if (e.kind !== 'waste') continue;
      for (let y = e.y + 2; y < Math.min(WORLD_H, e.y + e.h); y++) {
        for (let x = e.x + 2; x < e.x + e.w - 2; x++) {
          const j = y * WORLD_W + x;
          const k = this.grid.kind[j];
          if (k !== LIQUID && k !== POWDER) continue;
          const lot = getLot(this.grid.clear(j));
          this.losses.wasteML += lot.volumeML();
          freeLot(lot);
        }
      }
    }
  }

  /** Anything in the air or on the bench drifts to room temperature; steam condenses or drifts away. */
  private airborne(): void {
    this.disposeWaste();
    const { kind, life, temp, lot } = this.grid;
    for (let i = 0; i < kind.length; i++) {
      const k = kind[i];
      if (k === LIQUID || k === POWDER) temp[i] += (AMBIENT_C - temp[i]) * 0.01;
      if (k !== GAS) continue;
      temp[i] += (AMBIENT_C - temp[i]) * 0.02;
      life[i]++;
      const parcel = getLot(lot[i]);
      const bp = parcel.boilingPoint() ?? -999;
      if (life[i] > 90 && temp[i] < bp - 20 && Math.random() < 0.002) {
        // Condenses into a droplet.
        const drop = newLot('liquid');
        drop.mergeFrom(parcel);
        this.grid.retag(i, K.Liquid, drop.id);
        freeLot(parcel);
      } else if (life[i] > 160 + (this.grid.shade[i] & 127)) {
        this.lose(i);
      }
    }
  }

  /** Free every lot this world holds (before throwing it away). */
  dispose(): void {
    this.clearSpills();
    for (const c of this.containers) c.dispose();
    this.containers = [];
    for (const t of this.tools) if (t.lot) freeLot(t.lot);
    this.tools = [];
  }

  /** Remove everything spilled on the bench or floating in the air. */
  clearSpills(): void {
    const { kind } = this.grid;
    for (let i = 0; i < kind.length; i++) if (kind[i] === K.Liquid || kind[i] === K.Powder || kind[i] === K.Gas) this.lose(i);
  }
}

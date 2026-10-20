import { SCALE, VOL_PER_PX, WORLD_H, WORLD_W } from '../config';
import { getLot } from '../chem/lot';
import type { Container } from '../sim/container';
import { K } from '../sim/grid';
import { M_IN } from '../sim/shapes';
import type { Tool } from '../sim/tools';
import type { Equipment, World } from '../sim/world';
import { drawText, textWidth } from './pixelfont';

const W = WORLD_W;
const H = WORLD_H;

type RGB = [number, number, number];

/**
 * Draws the world into a 320×180 pixel buffer, scales it up with crisp pixels,
 * and adds a blurred emissive layer for heat glow.
 */
export class Renderer {
  private readonly sim = document.createElement('canvas');
  private readonly glow = document.createElement('canvas');
  private readonly simCtx: CanvasRenderingContext2D;
  private readonly glowCtx: CanvasRenderingContext2D;
  private readonly img: ImageData;
  private readonly glowImg: ImageData;
  private readonly background: Uint8ClampedArray;
  private readonly out: CanvasRenderingContext2D;
  private readonly ticks = new Map<number, [number, number][]>();
  /** Container under the cursor / being held. */
  hover: Container | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    this.out = canvas.getContext('2d')!;
    this.sim.width = this.glow.width = W;
    this.sim.height = this.glow.height = H;
    this.simCtx = this.sim.getContext('2d')!;
    this.glowCtx = this.glow.getContext('2d')!;
    this.img = this.simCtx.createImageData(W, H);
    this.glowImg = this.glowCtx.createImageData(W, H);
    this.background = buildBackground();
  }

  draw(world: World): void {
    const buf = this.img.data;
    buf.set(this.background);
    const glow = this.glowImg.data;
    glow.fill(0);

    for (const e of world.equipment) this.drawEquipmentBack(e, world, buf, glow);
    this.drawWorldParticles(world, buf, glow);
    for (const c of world.containers) this.drawContainer(c, buf, glow);
    for (const e of world.equipment) this.drawEquipmentFront(e, world, buf, glow);
    for (const t of world.tools) this.drawTool(t, buf);

    this.simCtx.putImageData(this.img, 0, 0);
    this.glowCtx.putImageData(this.glowImg, 0, 0);
    const o = this.out;
    o.imageSmoothingEnabled = false;
    o.globalCompositeOperation = 'source-over';
    o.filter = 'none';
    o.drawImage(this.sim, 0, 0, W * SCALE, H * SCALE);
    o.imageSmoothingEnabled = true;
    o.globalCompositeOperation = 'lighter';
    o.filter = `blur(${SCALE * 2.5}px)`;
    o.drawImage(this.glow, 0, 0, W * SCALE, H * SCALE);
    o.filter = 'none';
    o.globalAlpha = 0.6;
    o.imageSmoothingEnabled = false;
    o.drawImage(this.glow, 0, 0, W * SCALE, H * SCALE);
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
  }

  // ---------- particles ----------

  private drawWorldParticles(world: World, buf: Uint8ClampedArray, glow: Uint8ClampedArray): void {
    const { kind, lot, shade, temp, life } = world.grid;
    for (let i = 0; i < kind.length; i++) {
      const k = kind[i];
      if (k !== K.Liquid && k !== K.Powder && k !== K.Gas) continue;
      let alphaScale = 1;
      if (k === K.Gas) alphaScale = Math.max(0, 1 - life[i] / 240);
      this.particle(buf, glow, i, k, lot[i], shade[i], temp[i], alphaScale);
    }
  }

  private particle(
    buf: Uint8ClampedArray,
    glow: Uint8ClampedArray,
    p: number,
    k: number,
    lotId: number,
    shade: number,
    tC: number,
    alphaScale = 1,
  ): void {
    const [r, g, b, a] = getLot(lotId).rgba();
    const v = ((shade & 15) - 7) * (k === K.Powder ? 2.2 : 1.2);
    if (k === K.Gas) {
      blend(buf, p, 230 + v, 236 + v, 242 + v, (0.28 + (shade & 7) * 0.02) * alphaScale);
      return;
    }
    // Liquids: brighten the surface a touch for depth.
    blend(buf, p, r + v, g + v, b + v, k === K.Powder ? 1 : a * alphaScale);
    if (tC > 60) addGlow(glow, p, heatColor(tC), Math.min(1, (tC - 60) / 160));
  }

  // ---------- containers ----------

  private drawContainer(c: Container, buf: Uint8ClampedArray, glow: Uint8ClampedArray): void {
    const [x0, y0, x1, y1] = c.bounds();
    const { w, h } = c.shape;
    const g = c.grid;
    const highlight = this.hover === c;
    const ticks = this.gradTicks(c);
    const tickSet = new Set(ticks.map(([x, y]) => y * w + x));
    for (let wy = Math.max(0, y0); wy <= Math.min(H - 1, y1); wy++) {
      for (let wx = Math.max(0, x0); wx <= Math.min(W - 1, x1); wx++) {
        const [lx, ly] = c.worldToLocal(wx + 0.5, wy + 0.5);
        const x = Math.floor(lx);
        const y = Math.floor(ly);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        const k = g.kind[i];
        if (k === K.Void) continue;
        const p = wy * W + wx;
        if (c.tag && y >= h - 13 && y <= h - 5 && x >= 2 && x <= w - 3) {
          // Paper label on a stock bottle.
          const edge = y === h - 13 || y === h - 5;
          blend(buf, p, edge ? c.tag[0] : 226, edge ? c.tag[1] : 218, edge ? c.tag[2] : 196, 1);
          continue;
        }
        if (k === K.Wall) {
          const t = g.temp[i];
          const hot = Math.min(1, Math.max(0, (t - 50) / 200));
          const base = highlight ? 0.85 : 0.62;
          blend(buf, p, 165 + 70 * hot, 205 - 40 * hot, 228 - 110 * hot, base);
          if (hot > 0) addGlow(glow, p, heatColor(t), hot * 0.6);
        } else if (k === K.Filter) {
          blend(buf, p, 232, 228, 214, 1);
        } else {
          // Inside: faint glass back, then contents.
          blend(buf, p, 150, 190, 220, 0.07);
          if (tickSet.has(i)) blend(buf, p, 220, 235, 245, 0.45);
          if (k === K.Liquid || k === K.Powder || k === K.Gas) this.particle(buf, glow, p, k, g.lot[i], g.shade[i], g.temp[i]);
        }
      }
    }
  }

  /** Graduation marks: local cells where the cumulative volume crosses each mark. */
  private gradTicks(c: Container): [number, number][] {
    const cached = this.ticks.get(c.id);
    if (cached) return cached;
    const out: [number, number][] = [];
    const { w, h, mask } = c.shape;
    const step = c.def.reading === 'cylinder' ? 1 : c.def.reading === 'none' ? 0 : c.def.gradStep;
    if (step > 0) {
      let vol = 0;
      let next = step;
      for (let y = h - 1; y >= 0; y--) {
        let row = 0;
        let right = -1;
        for (let x = 0; x < w; x++) {
          if (mask[y * w + x] === M_IN) {
            row++;
            right = x;
          }
        }
        vol += row * VOL_PER_PX;
        if (vol >= next && right > 0) {
          const major = c.def.reading !== 'cylinder' || Math.round(next) % 5 === 0;
          out.push([right, y]);
          if (major) out.push([right - 1, y]);
          next += step;
        }
      }
    }
    this.ticks.set(c.id, out);
    return out;
  }

  /** Tool under the cursor (highlighted). */
  hoverTool: Tool | null = null;

  private drawTool(t: Tool, buf: Uint8ClampedArray): void {
    const hl = this.hoverTool === t;
    const x = Math.round(t.x);
    const y = Math.round(t.y);
    if (t.kind === 'rod') {
      for (let i = 0; i < t.length; i++) blend(buf, (y + i) * W + x, 200, 225, 240, hl ? 0.95 : 0.7);
      return;
    }
    if (t.kind === 'spatula') {
      for (let i = 0; i < t.length - 4; i++) blend(buf, (y + i) * W + x, 170, 176, 186, hl ? 1 : 0.85);
      rect(buf, x - 1, y + t.length - 4, 3, 4, hl ? [215, 220, 228] : [180, 186, 196]);
      if (t.lot && !t.lot.isEmpty()) {
        const [r, g, b] = t.lot.rgba();
        rect(buf, x - 1, y + t.length - 6, 3, 2, [r, g, b]);
      }
      return;
    }
    // Rubber bulb.
    rect(buf, x - 1, y, 3, 5, hl ? [230, 90, 80] : [190, 60, 55]);
    // Glass tube, narrowing to the tip.
    const tube = t.length - 5;
    const filled = Math.round((t.volumeML() / t.capacityML) * tube);
    const [r, g, b, a] = t.lot!.rgba();
    for (let i = 0; i < tube; i++) {
      const py = y + 5 + i;
      const fromTip = tube - 1 - i;
      const wide = i < tube - 6;
      blend(buf, py * W + x, 190, 220, 240, hl ? 0.9 : 0.6);
      if (wide) blend(buf, py * W + x - 1, 190, 220, 240, hl ? 0.7 : 0.45);
      if (fromTip < filled) blend(buf, py * W + x, r, g, b, Math.max(0.6, a));
    }
  }

  // ---------- equipment ----------

  private drawEquipmentBack(e: Equipment, world: World, buf: Uint8ClampedArray, glow: Uint8ClampedArray): void {
    if (e.kind === 'hotplate') {
      rect(buf, e.x, e.y + 2, e.w, e.h - 2, [52, 56, 64]);
      rect(buf, e.x, e.y + e.h - 1, e.w, 1, [32, 35, 40]);
      const hot = Math.min(1, Math.max(0, (e.temp - 30) / 300));
      const top: RGB = [200 + 55 * hot, 200 - 120 * hot, 200 - 170 * hot];
      rect(buf, e.x + 1, e.y, e.w - 2, 2, top);
      if (hot > 0) for (let x = e.x + 2; x < e.x + e.w - 2; x++) addGlow(glow, e.y * W + x, heatColor(e.temp), hot);
      // Knob and display.
      rect(buf, e.x + 3, e.y + 4, 14, 7, [16, 18, 22]);
      drawText(buf, W, H, e.x + 4, e.y + 5, e.on ? String(Math.round(e.setpoint)) : 'OFF', e.on ? [255, 120, 60] : [90, 96, 110]);
      rect(buf, e.x + e.w - 8, e.y + 5, 5, 5, e.on ? [220, 70, 40] : [90, 96, 110]);
      if (e.on) addGlow(glow, (e.y + 7) * W + e.x + e.w - 6, [255, 80, 40], 0.8);
    } else if (e.kind === 'bath') {
      // Back wall of the basin.
      rect(buf, e.x, e.y, e.w, e.h, [70, 78, 92]);
      rect(buf, e.x + 2, e.y, e.w - 4, e.h - 2, [36, 42, 52]);
      const level = e.levelY ?? e.y + 4;
      const [r, g, b] = e.fixedTemp ? [150, 190, 225] : bathColor(e.temp);
      for (let y = level; y < e.y + e.h - 2; y++) for (let x = e.x + 2; x < e.x + e.w - 2; x++) blend(buf, y * W + x, r, g, b, 0.55);
    } else if (e.kind === 'balance') {
      rect(buf, e.x, e.y, e.w, 2, [190, 194, 200]);
      rect(buf, e.x + 2, e.y + 2, e.w - 4, e.h - 2, [58, 62, 70]);
    } else if (e.kind === 'hood') {
      // Fume hood: dark recessed box, lit from the top, sash half down.
      rect(buf, e.x, e.y, e.w, e.h, [14, 18, 24]);
      rect(buf, e.x + 2, e.y + 2, e.w - 4, 2, [255, 226, 160], 0.55);
      for (let x = e.x + 2; x < e.x + e.w - 2; x++) addGlow(glow, (e.y + 3) * W + x, [255, 210, 140], 0.12);
      rect(buf, e.x, e.y, 2, e.h, [84, 90, 102]);
      rect(buf, e.x + e.w - 2, e.y, 2, e.h, [84, 90, 102]);
      rect(buf, e.x, e.y, e.w, 2, [84, 90, 102]);
      drawText(buf, W, H, e.x + 4, e.y + 6, 'FUME HOOD', [120, 128, 142]);
    } else if (e.kind === 'stand') {
      const base = world.benchY;
      rect(buf, e.x - 2, base - 2, e.w + 4, 2, [70, 74, 84]);
      rect(buf, e.x + e.w + 1, e.y - 8, 2, base - e.y + 6, [120, 126, 138]);
      rect(buf, e.x, e.y, e.w, 2, [150, 156, 168]);
      rect(buf, e.x + e.w, e.y, 3, 2, [150, 156, 168]);
      // Vacuum hose to the filter flask's side arm.
      for (let i = 0; i < 14; i++) rect(buf, e.x + e.w + 3 + Math.round(Math.sin(i / 3) * 1.5), base - 26 + i, 2, 1, [60, 64, 70]);
      rect(buf, e.x + e.w + 6, base - 9, textWidth(e.on ? 'VAC' : 'VAC') + 4, 7, [16, 18, 22]);
      drawText(buf, W, H, e.x + e.w + 8, base - 8, 'VAC', e.on ? [110, 255, 150] : [90, 96, 110]);
      if (e.on) addGlow(glow, (base - 6) * W + e.x + e.w + 10, [40, 200, 90], 0.5);
    } else if (e.kind === 'mp') {
      rect(buf, e.x, e.y, e.w, 2, [180, 184, 192]);
      rect(buf, e.x + 1, e.y + 2, e.w - 2, e.h - 2, [62, 52, 58]);
      const txt = e.display ?? '---';
      rect(buf, e.x + 3, e.y + 5, e.w - 6, 7, [12, 30, 20]);
      drawText(buf, W, H, e.x + 4, e.y + 6, txt.slice(0, Math.floor((e.w - 8) / 4)), [110, 255, 150]);
      if (e.temp > 40) {
        const hot = Math.min(1, (e.temp - 40) / 120);
        for (let x = e.x + 2; x < e.x + e.w - 2; x++) addGlow(glow, e.y * W + x, heatColor(e.temp), hot * 0.6);
      }
    } else if (e.kind === 'waste') {
      rect(buf, e.x, e.y, e.w, e.h, [44, 52, 46]);
      rect(buf, e.x + 2, e.y + 2, e.w - 4, 3, [20, 24, 22]);
      rect(buf, e.x, e.y, e.w, 2, [70, 82, 72]);
      drawText(buf, W, H, e.x + 3, e.y + 9, 'WASTE', [230, 200, 80]);
    } else if (e.kind === 'shelf') {
      rect(buf, e.x, e.y, e.w, 3, [92, 70, 52]);
      rect(buf, e.x, e.y + 3, e.w, 1, [50, 38, 28]);
      rect(buf, e.x + 2, e.y + 4, 2, 6, [60, 64, 72]);
      rect(buf, e.x + e.w - 4, e.y + 4, 2, 6, [60, 64, 72]);
    }
  }

  private drawEquipmentFront(e: Equipment, world: World, buf: Uint8ClampedArray, glow: Uint8ClampedArray): void {
    if (e.kind === 'bath') {
      // Front water layer over anything standing in the bath.
      const level = e.levelY ?? e.y + 4;
      const [r, g, b] = e.fixedTemp ? [150, 190, 225] : bathColor(e.temp);
      for (let y = level; y < e.y + e.h - 2; y++) {
        for (let x = e.x + 2; x < e.x + e.w - 2; x++) {
          blend(buf, y * W + x, r, g, b, y === level ? 0.55 : 0.28);
          if (!e.fixedTemp && e.temp > 45) addGlow(glow, y * W + x, heatColor(e.temp + 40), Math.min(0.25, (e.temp - 45) / 200));
        }
      }
      if (e.fixedTemp) {
        // Ice cubes.
        for (let k = 0; k < 6; k++) {
          const ix = e.x + 4 + ((k * 13) % (e.w - 10));
          const iy = level + 1 + ((k * 7) % Math.max(1, e.y + e.h - level - 6));
          rect(buf, ix, iy, 4, 3, [225, 240, 250], 0.75);
        }
      }
      rect(buf, e.x, e.y, 2, e.h, [96, 104, 118]);
      rect(buf, e.x + e.w - 2, e.y, 2, e.h, [96, 104, 118]);
      rect(buf, e.x, e.y + e.h - 2, e.w, 2, [96, 104, 118]);
      // Display panel below the basin rim.
      const label = e.fixedTemp ? 'ICE' : e.on ? `${Math.round(e.temp)}°` : 'OFF';
      rect(buf, e.x + 3, e.y + e.h, textWidth(label) + 4, 7, [16, 18, 22]);
      drawText(buf, W, H, e.x + 5, e.y + e.h + 1, label, e.fixedTemp ? [150, 200, 240] : e.on ? [255, 160, 70] : [90, 96, 110]);
    } else if (e.kind === 'balance') {
      const on = world.containers.find((c) => c.restOn === e.id && !c.held);
      const grams = on ? on.grossMass() - (e.tare ?? 0) : -(e.tare ?? 0);
      const txt = (Math.abs(grams) < 0.005 ? 0 : grams).toFixed(2);
      rect(buf, e.x + 3, e.y + 4, e.w - 6, 7, [12, 30, 20]);
      drawText(buf, W, H, e.x + e.w - 4 - textWidth(txt + 'g'), e.y + 5, txt + 'g', [110, 255, 150]);
      for (let x = e.x + 3; x < e.x + e.w - 3; x++) addGlow(glow, (e.y + 7) * W + x, [40, 160, 80], 0.15);
    }
  }
}

// ---------- helpers ----------

function blend(buf: Uint8ClampedArray, p: number, r: number, g: number, b: number, a: number): void {
  const i = p * 4;
  buf[i] += (r - buf[i]) * a;
  buf[i + 1] += (g - buf[i + 1]) * a;
  buf[i + 2] += (b - buf[i + 2]) * a;
}

function addGlow(glow: Uint8ClampedArray, p: number, rgb: RGB, k: number): void {
  const i = p * 4;
  glow[i] = Math.min(255, glow[i] + rgb[0] * k);
  glow[i + 1] = Math.min(255, glow[i + 1] + rgb[1] * k);
  glow[i + 2] = Math.min(255, glow[i + 2] + rgb[2] * k);
  glow[i + 3] = 255;
}

function rect(buf: Uint8ClampedArray, x: number, y: number, w: number, h: number, rgb: RGB, a = 1): void {
  for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) blend(buf, yy * W + xx, rgb[0], rgb[1], rgb[2], a);
  }
}

/** Incandescent colour ramp for glow. */
function heatColor(tC: number): RGB {
  const t = Math.min(1, Math.max(0, (tC - 60) / 300));
  return [255, 90 + 120 * t, 30 + 80 * t * t];
}

/** Bath water stays blue; it only warms slightly in tone (the glow layer shows heat). */
function bathColor(tC: number): RGB {
  const t = Math.min(1, Math.max(0, (tC - 20) / 80));
  return [80 + 25 * t, 150 - 5 * t, 220 - 25 * t];
}

/** Static backdrop: tiled lab wall, fume hood frame, bench. */
function buildBackground(): Uint8ClampedArray {
  const b = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const grout = x % 16 === 0 || y % 12 === 0;
      const n = ((x * 73856093) ^ (y * 19349663)) & 7;
      const base = grout ? 20 : 26 + n * 0.6;
      b[i] = base - 4;
      b[i + 1] = base;
      b[i + 2] = base + 12;
      b[i + 3] = 255;
    }
  }
  // Light falling off toward the bottom corners.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const d = Math.hypot((x - W * 0.55) / W, (y - H * 0.25) / H);
      const k = Math.max(0.55, 1.15 - d * 0.9);
      b[i] *= k;
      b[i + 1] *= k;
      b[i + 2] *= k;
    }
  }
  // Bench.
  for (let y = 164; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const top = y === 164;
      const n = ((x * 31) ^ (y * 17)) & 3;
      b[i] = top ? 70 : 30 + n;
      b[i + 1] = top ? 76 : 33 + n;
      b[i + 2] = top ? 88 : 40 + n;
    }
  }
  return b;
}

import { WORLD_H, WORLD_W } from '../config';
import type { Container } from '../sim/container';
import type { World } from '../sim/world';

const MAX_TILT = 2.3; // rad (~130°)

/**
 * Mouse and keyboard handling:
 *  - left-drag a piece of glassware to move it;
 *  - right-drag (or mouse wheel / Q and E while holding) to tilt and pour;
 *  - let go and it rights itself and settles on whatever is below.
 */
export class Input {
  /** Cursor in world pixels. */
  mx = 0;
  my = 0;
  held: Container | null = null;
  private grabDX = 0;
  private grabDY = 0;
  private tilt: { c: Container; x0: number; a0: number } | null = null;
  private keys = new Set<string>();
  /** Fires on the first user gesture (for audio unlock). */
  onGesture: () => void = () => {};
  /** Fires when a container is clicked without dragging (tool actions). */
  onClick: (c: Container | null, x: number, y: number) => void = () => {};
  private downAt: { x: number; y: number } | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private world: () => World,
  ) {
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private toWorld(e: PointerEvent | WheelEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.mx = ((e.clientX - r.left) / r.width) * WORLD_W;
    this.my = ((e.clientY - r.top) / r.height) * WORLD_H;
  }

  private down(e: PointerEvent): void {
    this.onGesture();
    this.toWorld(e);
    const w = this.world();
    const c = this.held ?? w.containerAt(this.mx, this.my);
    if (e.button === 0) {
      this.downAt = { x: this.mx, y: this.my };
      if (!c) return;
      this.held = c;
      c.held = true;
      w.raise(c);
      this.grabDX = c.x - this.mx;
      this.grabDY = c.y - this.my;
      this.canvas.setPointerCapture(e.pointerId);
    } else if (e.button === 2 && c) {
      this.tilt = { c, x0: this.mx, a0: c.angle };
      c.tilting = true;
      w.raise(c);
      this.canvas.setPointerCapture(e.pointerId);
    }
  }

  private move(e: PointerEvent): void {
    this.toWorld(e);
    if (this.held) {
      const c = this.held;
      c.x = Math.min(WORLD_W - 4, Math.max(4, this.mx + this.grabDX));
      c.y = Math.max(4, this.my + this.grabDY);
      const over = c.bottomY - this.world().benchY;
      if (over > 0 && Math.abs(c.angle) < 0.5) c.y -= over;
    }
    if (this.tilt) {
      this.tilt.c.angle = clamp(this.tilt.a0 + (this.mx - this.tilt.x0) * 0.045, -MAX_TILT, MAX_TILT);
    }
  }

  private up(e: PointerEvent): void {
    if (e.button === 0) {
      const moved = this.downAt ? Math.hypot(this.mx - this.downAt.x, this.my - this.downAt.y) : 99;
      if (moved < 1.5) this.onClick(this.held, this.mx, this.my);
      this.downAt = null;
      if (this.held) {
        this.held.held = false;
        if (this.tilt?.c !== this.held) this.held.tilting = false;
        this.held = null;
      }
    } else if (e.button === 2 && this.tilt) {
      this.tilt.c.tilting = false;
      this.tilt = null;
    }
  }

  private wheel(e: WheelEvent): void {
    if (!this.held) return;
    e.preventDefault();
    this.held.angle = clamp(this.held.angle + Math.sign(e.deltaY) * 0.08, -MAX_TILT, MAX_TILT);
  }

  /** Per-frame keyboard tilt while holding. */
  update(dt: number): void {
    const c = this.held;
    if (!c) return;
    let d = 0;
    if (this.keys.has('q') || this.keys.has('a')) d -= 1;
    if (this.keys.has('e') || this.keys.has('d')) d += 1;
    if (d) c.angle = clamp(c.angle + d * 1.6 * dt, -MAX_TILT, MAX_TILT);
  }

  /** Container the cursor is over (or holding). */
  hover(): Container | null {
    return this.held ?? this.tilt?.c ?? this.world().containerAt(this.mx, this.my);
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

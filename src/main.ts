import './style.css';
import { LAB_SECONDS_PER_TICK, SCALE } from './config';
import type { AppContext, Mode } from './modes/mode';
import { SandboxMode } from './modes/sandbox';
import { Renderer } from './render/renderer';
import { resetSimEvents } from './sim/events';
import { World } from './sim/world';
import { Sfx } from './ui/audio';
import { Input } from './ui/input';
import { StructurePanel } from './ui/structure';

const $ = (id: string) => document.getElementById(id)!;

const canvas = $('view') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const sfx = new Sfx();
const ctx: AppContext = {
  world: new World(),
  renderer,
  input: null as unknown as Input,
  structure: new StructurePanel($('structure'), $('mol-stage'), $('mol-name'), $('mol-formula')),
  panel: $('panel'),
  sfx,
  speed: 1,
};
ctx.input = new Input(canvas, () => ctx.world);
ctx.input.onGesture = () => sfx.unlock();
ctx.input.onClick = (c, x, y) => mode.click?.(c, x, y, ctx);

const MODES: { make: () => Mode; label: string; disabled?: boolean }[] = [
  { make: () => new SandboxMode(), label: 'Sandbox' },
  { make: () => new SandboxMode(), label: 'Level 1 · Aspirin (coming next)', disabled: true },
  { make: () => new SandboxMode(), label: 'Challenge (later)', disabled: true },
];

let mode: Mode = MODES[0].make();
const nav = $('modes');
MODES.forEach((m, i) => {
  const b = document.createElement('button');
  b.textContent = m.label;
  b.disabled = !!m.disabled;
  b.onclick = () => setMode(i);
  nav.append(b);
});

function setMode(i: number): void {
  ctx.world.dispose();
  mode = MODES[i].make();
  ctx.speed = 1;
  mode.enter(ctx);
  [...nav.children].forEach((b, j) => b.classList.toggle('on', j === i));
}
setMode(0);

// ---------- loop ----------

const tooltip = $('tooltip');
const clock = $('clock');
let last = performance.now();
let uiTimer = 0;

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  resetSimEvents();
  ctx.input.update(dt);
  for (let t = 0; t < ctx.speed; t++) ctx.world.update(LAB_SECONDS_PER_TICK);
  mode.frame?.(ctx);
  renderer.hover = ctx.input.hover();
  renderer.draw(ctx.world);
  sfx.update();

  uiTimer += dt;
  if (uiTimer > 0.12) {
    uiTimer = 0;
    mode.refresh?.(ctx);
    updateTooltip();
    const s = Math.floor(ctx.world.labTime);
    clock.textContent = `lab time ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}${ctx.speed > 1 ? `  ▶▶ ${ctx.speed}×` : ''}`;
  }
  requestAnimationFrame(frame);
}

function updateTooltip(): void {
  const c = ctx.input.hover();
  if (!c) {
    tooltip.hidden = true;
    return;
  }
  tooltip.hidden = false;
  tooltip.innerHTML = mode.tooltip(c, ctx);
  const r = canvas.getBoundingClientRect();
  const sx = r.width / canvas.width;
  const [, y0, x1] = c.bounds();
  const px = Math.min(r.width - tooltip.offsetWidth - 4, x1 * SCALE * sx + 8);
  tooltip.style.left = `${Math.max(4, px)}px`;
  tooltip.style.top = `${Math.max(4, y0 * SCALE * sx)}px`;
}

requestAnimationFrame(frame);

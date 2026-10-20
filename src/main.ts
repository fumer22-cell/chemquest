import './style.css';
import { LAB_SECONDS_PER_TICK, SCALE } from './config';
import type { AppContext, Mode } from './modes/mode';
import { AspirinMode } from './modes/aspirin';
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
  paused: false,
  restart: () => setMode(current),
};
ctx.input = new Input(canvas, () => ctx.world);
ctx.input.onGesture = () => sfx.unlock();
ctx.input.onClick = (c, x, y) => mode.click?.(c, x, y, ctx);
ctx.input.onToolAct = (t, fine) => {
  if (ctx.paused) return;
  if (mode.toolAct) mode.toolAct(t, ctx, fine);
  else t.act(ctx.world, fine);
};

const MODES: { make: () => Mode; label: string; disabled?: boolean }[] = [
  { make: () => new AspirinMode(), label: 'Level 1 · Aspirin' },
  { make: () => new SandboxMode(), label: 'Sandbox' },
  { make: () => new AspirinMode(true), label: 'Challenge (preview)' },
];
let current = 0;

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
  current = i;
  ctx.paused = false;
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
  if (!ctx.paused) for (let t = 0; t < ctx.speed; t++) ctx.world.update(LAB_SECONDS_PER_TICK);
  mode.frame?.(ctx);
  renderer.hover = ctx.input.hover();
  renderer.hoverTool = ctx.input.hoverTool();
  renderer.draw(ctx.world);
  sfx.update();

  uiTimer += dt;
  if (uiTimer > 0.12) {
    uiTimer = 0;
    mode.refresh?.(ctx);
    updateTooltip();
    const s = Math.floor(ctx.world.labTime);
    clock.textContent = `lab time ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}${ctx.paused ? '  ❚❚ paused' : ctx.speed > 1 ? `  ▶▶ ${ctx.speed}×` : ''}`;
  }
  requestAnimationFrame(frame);
}

function updateTooltip(): void {
  const c = ctx.input.hover();
  const t = ctx.input.hoverTool();
  if (!c && !(t && mode.toolTooltip)) {
    tooltip.hidden = true;
    return;
  }
  tooltip.hidden = false;
  tooltip.innerHTML = c ? mode.tooltip(c, ctx) : mode.toolTooltip!(t!, ctx);
  const r = canvas.getBoundingClientRect();
  const sx = r.width / canvas.width;
  const [, y0, x1] = c ? c.bounds() : [0, t!.y, t!.x + 3];
  const px = Math.min(r.width - tooltip.offsetWidth - 4, x1 * SCALE * sx + 8);
  tooltip.style.left = `${Math.max(4, px)}px`;
  tooltip.style.top = `${Math.max(4, y0 * SCALE * sx)}px`;
}

requestAnimationFrame(frame);

// Handy for debugging from the browser console.
Object.assign(window as object, { __ctx: ctx, __mode: () => mode });

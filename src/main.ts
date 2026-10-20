import './style.css';
import { LAB_SECONDS_PER_TICK, SCALE } from './config';
import type { AppContext, Mode } from './modes/mode';
import { AspirinMode } from './modes/aspirin';
import { SandboxMode } from './modes/sandbox';
import { Renderer } from './render/renderer';
import { resetSimEvents } from './sim/events';
import { controlAt } from './sim/controls';
import { World } from './sim/world';
import { Sfx } from './ui/audio';
import { Input } from './ui/input';
import { containerInfo, predictEffect, toolInfo } from './ui/molecules';
import type { Container } from './sim/container';
import type { Lot } from './chem/lot';
import { MoleculeBar } from './ui/structure';

const $ = (id: string) => document.getElementById(id)!;

const canvas = $('view') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const sfx = new Sfx();
const ctx: AppContext = {
  world: new World(),
  renderer,
  input: null as unknown as Input,
  molecules: new MoleculeBar($('structure')),
  panel: $('panel'),
  sfx,
  speed: 1,
  paused: false,
  restart: () => setMode(current),
};
ctx.input = new Input(canvas, () => ctx.world);
ctx.input.onGesture = () => sfx.unlock();
ctx.input.onClick = (c, x, y, fine) => {
  const ctl = c ? null : controlAt(ctx.world, x, y);
  if (ctl) {
    ctl.act(ctx.world, fine);
    sfx.clink();
    return;
  }
  mode.click?.(c, x, y, ctx);
};
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
  const ctl = ctx.input.held || ctx.input.heldTool ? null : controlAt(ctx.world, ctx.input.mx, ctx.input.my);
  renderer.hoverControl = ctl?.id ?? null;
  canvas.style.cursor = ctl ? 'pointer' : '';
  renderer.draw(ctx.world);
  sfx.update();

  uiTimer += dt;
  if (uiTimer > 0.12) {
    uiTimer = 0;
    mode.refresh?.(ctx);
    updateTooltip();
    updateMolecules();
    const s = Math.floor(ctx.world.labTime);
    clock.textContent = `lab time ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}${ctx.paused ? '  ❚❚ paused' : ctx.speed > 1 ? `  ▶▶ ${ctx.speed}×` : ''}`;
  }
  requestAnimationFrame(frame);
}

/** Structure bar: what you are working on (live), what you hold, and what adding it would do. */
function updateMolecules(): void {
  const w = ctx.world;
  const focus = mode.focus ?? [];
  const held = ctx.input.held;
  const tool = ctx.input.heldTool;
  let work = w.lastFilled ?? mode.defaultWorking?.(ctx) ?? null;
  if (work && !w.containers.includes(work)) work = mode.defaultWorking?.(ctx) ?? null;
  // Whatever is below the mouth of what you hold (or the tool tip) is the target.
  const from = held ? held.localToWorld(held.pivotX, 0) : tool ? tool.tip() : null;
  const target = from ? (vesselBelow(from[0], from[1], held) ?? work) : work;
  const workInfo = work && work !== held ? containerInfo(work, 'Working on', focus) : null;
  let handInfo = null;
  let heldLots: Lot[] = [];
  if (held) {
    handInfo = containerInfo(held, 'In hand', focus);
    heldLots = [held.liquid, held.solid];
  } else if (tool) {
    handInfo = toolInfo(tool, focus);
    if (tool.lot) heldLots = [tool.lot];
  }
  const effTarget = target && target !== held ? target : null;
  const effect = effTarget && heldLots.some((l) => !l.isEmpty()) ? predictEffect(heldLots, effTarget, w.reactions) : null;
  const shown = effTarget && (held || tool) ? effTarget : work;
  ctx.molecules.update(shown && shown !== held ? containerInfo(shown, held || tool ? 'Into' : 'Working on', focus) : workInfo, handInfo, effect);
}

function vesselBelow(x: number, y: number, skip: Container | null): Container | null {
  for (let dy = 0; dy < 70; dy += 2) {
    const c = ctx.world.containerAt(x, y + dy);
    if (c && c !== skip) return c;
  }
  return null;
}

function updateTooltip(): void {
  const ctl = ctx.input.held || ctx.input.heldTool ? null : controlAt(ctx.world, ctx.input.mx, ctx.input.my);
  if (ctl) {
    tooltip.hidden = false;
    tooltip.innerHTML = `<b>${ctl.text}</b>\n${ctl.hint}`;
    const r = canvas.getBoundingClientRect();
    const sx = r.width / canvas.width;
    tooltip.style.left = `${Math.max(4, Math.min(r.width - tooltip.offsetWidth - 4, ctl.x * SCALE * sx))}px`;
    tooltip.style.top = `${Math.max(4, ctl.y * SCALE * sx - tooltip.offsetHeight - 6)}px`;
    return;
  }
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

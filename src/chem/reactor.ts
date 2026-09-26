import type { ReactionDef } from '../data/reactions';
import { EPS } from './constants';
import type { Mixture } from './mixture';
import { allReactions } from './registry';

export interface ReactContext {
  /** Ignition spark present (recombiner). */
  spark?: boolean;
  /** Heat capacity of the container itself, J/K. */
  extraHeatCapacity?: number;
  /** Restrict to these reactions (defaults to all registered). */
  reactions?: readonly ReactionDef[];
}

export interface ReactionEvent {
  reaction: ReactionDef;
  /** Moles of reaction (ξ): how many times the equation "ran". */
  extent: number;
  /** Reactant that ran out first (limiting reagent). */
  limiting: string;
  /** Leftover reactants (excess), mol. */
  excess: Record<string, number>;
  consumed: Record<string, number>;
  produced: Record<string, number>;
  /** Heat released by the reaction itself, J (positive = exothermic). */
  heatJ: number;
  temperatureBeforeK: number;
  temperatureAfterK: number;
}

/** Why a reaction can't run right now, or null if it can. */
export function blockedReason(r: ReactionDef, mix: Mixture, ctx: ReactContext = {}): string | null {
  const c = r.conditions ?? {};
  for (const t of r.reactants) if (mix.moles(t.id) <= EPS) return `missing ${t.id}`;
  if (c.requiresWater && mix.waterMoles() <= EPS) return 'needs water';
  if (c.catalyst && mix.moles(c.catalyst) <= EPS) return `needs catalyst ${c.catalyst}`;
  if (c.minTempK !== undefined && mix.temperatureK < c.minTempK) return 'too cold';
  if (c.spark && !ctx.spark) return 'needs ignition';
  if (c.minMolarity) {
    for (const [id, m] of Object.entries(c.minMolarity)) {
      if (mix.molarity(id) < m) return `${id} too dilute`;
    }
  }
  return null;
}

/** Largest extent possible now, and which reactant limits it. */
export function maxExtent(r: ReactionDef, mix: Mixture): { extent: number; limiting: string } {
  const vL = mix.liquidVolumeML() / 1000;
  let best = Infinity;
  let limiting = r.reactants[0].id;
  for (const t of r.reactants) {
    let avail = mix.moles(t.id);
    const floor = r.conditions?.minMolarity?.[t.id];
    if (floor !== undefined) avail = Math.max(0, avail - floor * vL);
    const x = avail / t.coef;
    if (x < best) {
      best = x;
      limiting = t.id;
    }
  }
  return { extent: best === Infinity ? 0 : best, limiting };
}

/** Run one reaction to extent ξ on the mixture (no condition checks). */
export function applyReaction(
  r: ReactionDef,
  mix: Mixture,
  extent: number,
  limiting: string,
  extraC = 0,
): ReactionEvent {
  const tBefore = mix.temperatureK;
  const consumed: Record<string, number> = {};
  const produced: Record<string, number> = {};
  for (const t of r.reactants) consumed[t.id] = mix.remove(t.id, t.coef * extent);
  for (const t of r.products) {
    mix.add(t.id, t.coef * extent);
    produced[t.id] = t.coef * extent;
  }
  const heatJ = -r.deltaH * 1000 * extent;
  mix.addHeat(heatJ, extraC);
  const excess: Record<string, number> = {};
  for (const t of r.reactants) {
    const left = mix.moles(t.id);
    if (left > EPS) excess[t.id] = left;
  }
  return {
    reaction: r,
    extent,
    limiting,
    excess,
    consumed,
    produced,
    heatJ,
    temperatureBeforeK: tBefore,
    temperatureAfterK: mix.temperatureK,
  };
}

/**
 * Let everything that can happen in the mixture happen. Reactions are fast
 * (run to completion); each one's heat can trigger the next (e.g. warming acid
 * enough for a slower reaction). Returns what happened, in order.
 */
export function react(mix: Mixture, ctx: ReactContext = {}): ReactionEvent[] {
  const extraC = ctx.extraHeatCapacity ?? 0;
  const pool = ctx.reactions ?? allReactions();
  const events: ReactionEvent[] = [];
  mix.settle(true, extraC);
  for (let iter = 0; iter < 32; iter++) {
    let fired = false;
    for (const r of pool) {
      if (blockedReason(r, mix, ctx)) continue;
      const { extent, limiting } = maxExtent(r, mix);
      if (extent <= 1e-9) continue;
      const ev = applyReaction(r, mix, extent, limiting, extraC);
      mix.settle(true, extraC);
      ev.temperatureAfterK = mix.temperatureK;
      events.push(ev);
      fired = true;
      break; // re-scan from the top: conditions may have changed
    }
    if (!fired) break;
  }
  return mergeEvents(events);
}

/** Combine consecutive events of the same reaction into one. */
function mergeEvents(events: ReactionEvent[]): ReactionEvent[] {
  const out: ReactionEvent[] = [];
  for (const ev of events) {
    const last = out[out.length - 1];
    if (last && last.reaction === ev.reaction) {
      last.extent += ev.extent;
      last.heatJ += ev.heatJ;
      for (const [k, v] of Object.entries(ev.consumed)) last.consumed[k] = (last.consumed[k] ?? 0) + v;
      for (const [k, v] of Object.entries(ev.produced)) last.produced[k] = (last.produced[k] ?? 0) + v;
      last.excess = ev.excess;
      last.limiting = ev.limiting;
      last.temperatureAfterK = ev.temperatureAfterK;
    } else out.push(ev);
  }
  return out;
}

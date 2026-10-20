import type { ReactionDef } from '../chem/kinetics';
import type { Lot } from '../chem/lot';
import { substance } from '../data/substances';
import type { Container } from '../sim/container';
import type { Tool } from '../sim/tools';
import type { Effect, MolInfo } from './structure';

/** Short everyday name for a substance (drops parenthetical notes). */
export function shortName(id: string): string {
  if (id === 'aspirin') return 'aspirin';
  return substance(id).name.replace(/\s*\(.*\)$/, '');
}

function totals(lots: Lot[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lots) for (const id of l.ids()) m.set(id, (m.get(id) ?? 0) + l.mol(id));
  return m;
}

/**
 * Pick the molecule that best represents a mixture. If any of the level's
 * `focus` molecules are present, the most abundant of those (by moles) wins,
 * so the display follows the reaction (salicylic acid → aspirin). Otherwise
 * the largest component by mass, preferring a solute over plain water.
 */
export function describe(lots: Lot[], focus: string[] = []): { key: string | null; mix: { label: string; frac: number }[] } {
  const mol = totals(lots);
  const present = focus.filter((id) => (mol.get(id) ?? 0) > 1e-7);
  if (present.length) {
    const sum = present.reduce((s, id) => s + mol.get(id)!, 0);
    const sorted = present.sort((a, b) => mol.get(b)! - mol.get(a)!);
    return {
      key: sorted[0],
      mix: sorted.slice(0, 3).map((id) => ({ label: shortName(id), frac: mol.get(id)! / sum })),
    };
  }
  const grams = [...mol].map(([id, m]) => [id, m * substance(id).mw] as [string, number]).sort((a, b) => b[1] - a[1]);
  if (!grams.length) return { key: null, mix: [] };
  const total = grams.reduce((s, g) => s + g[1], 0);
  let key = grams[0][0];
  if (key === 'water' && grams.length > 1 && grams[1][1] / total > 0.002) key = grams[1][0];
  return { key, mix: grams.slice(0, 3).map(([id, g]) => ({ label: shortName(id), frac: g / total })) };
}

export function containerInfo(c: Container, stage: string, focus: string[]): MolInfo {
  const d = describe([c.liquid, c.solid], focus);
  return {
    substanceId: d.key,
    stage: `${stage} · ${c.label.replace(/\s*\(.*\)$/, '')}`,
    name: d.key ? undefined : 'empty',
    mix: d.mix.length > 1 ? d.mix : undefined,
  };
}

export function toolInfo(t: Tool, focus: string[]): MolInfo {
  if (!t.lot) return { substanceId: null, stage: 'In hand', name: t.label };
  const d = describe([t.lot], focus);
  return { substanceId: d.key, stage: `In hand · ${t.label}`, name: d.key ? undefined : `${t.label} (empty)` };
}

/**
 * What would happen if the held material went into the working vessel:
 * reactions whose reactants would then all be present, with at least one
 * coming from what you hold (or the catalyst coming from it).
 */
export function predictEffect(held: Lot[], target: Container, reactions: readonly ReactionDef[]): Effect | null {
  const h = totals(held);
  const t = totals([target.liquid, target.solid]);
  const has = (id: string) => (h.get(id) ?? 0) > 1e-9 || (t.get(id) ?? 0) > 1e-9;
  const fromHand = (id: string) => (h.get(id) ?? 0) > 1e-9 && !((t.get(id) ?? 0) > 1e-9);
  const lines: { text: string; warn: boolean }[] = [];
  for (const r of reactions) {
    if (!r.reactants.every((x) => has(x.id))) continue;
    const brings = r.reactants.some((x) => fromHand(x.id)) || (r.catalyst && fromHand(r.catalyst.id));
    const needsTarget = r.reactants.some((x) => (t.get(x.id) ?? 0) > 1e-9);
    if (!brings || !needsTarget) continue;
    const eq = `${r.reactants.map((x) => shortName(x.id)).join(' + ')} → ${r.products.map((x) => shortName(x.id)).join(' + ')}`;
    const cat = r.catalyst && fromHand(r.catalyst.id) ? ` (${shortName(r.catalyst.id)} is the catalyst)` : '';
    const warn = r.id === 'assa' || r.id === 'decomposition' || r.id === 'aspirin_hydrolysis';
    lines.push({ text: `<b>${r.effect ?? r.name}</b><br><span class="eq">${eq}</span>${cat}`, warn });
  }
  if (!lines.length) return null;
  lines.sort((a, b) => Number(a.warn) - Number(b.warn));
  const shown = lines.slice(0, 2);
  return {
    text: `<span class="lead">Into the ${target.label.replace(/\s*\(.*\)$/, '')}:</span>${shown.map((l) => `<div class="${l.warn ? 'w' : ''}">${l.text}</div>`).join('')}`,
    tone: shown[0].warn ? 'warn' : 'good',
  };
}

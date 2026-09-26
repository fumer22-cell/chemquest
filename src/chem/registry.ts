import { SUBSTANCES, type SubstanceDef } from '../data/substances';
import { REACTIONS, type ReactionDef } from '../data/reactions';
import { molarMass, parseFormula, type Composition } from './formula';

export interface Substance extends SubstanceDef {
  /** g/mol, computed from the formula. */
  molarMass: number;
  composition: Composition;
}

const substances = new Map<string, Substance>();
const reactions: ReactionDef[] = [];

export function registerSubstance(def: SubstanceDef): Substance {
  const s: Substance = {
    ...def,
    molarMass: molarMass(def.formula),
    composition: parseFormula(def.formula),
  };
  substances.set(def.id, s);
  return s;
}

export function registerReaction(def: ReactionDef): void {
  for (const t of [...def.reactants, ...def.products]) {
    if (!substances.has(t.id)) throw new Error(`Reaction ${def.id} uses unknown substance ${t.id}`);
  }
  reactions.push(def);
}

SUBSTANCES.forEach(registerSubstance);
REACTIONS.forEach(registerReaction);

export function getSubstance(id: string): Substance {
  const s = substances.get(id);
  if (!s) throw new Error(`Unknown substance: ${id}`);
  return s;
}

export function allSubstances(): Substance[] {
  return [...substances.values()];
}

export function allReactions(): readonly ReactionDef[] {
  return reactions;
}

export function getReaction(id: string): ReactionDef {
  const r = reactions.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown reaction: ${id}`);
  return r;
}

/** Atom balance check: returns element → (products - reactants); empty when balanced. */
export function imbalance(r: ReactionDef): Record<string, number> {
  const diff: Record<string, number> = {};
  const add = (id: string, coef: number, sign: number) => {
    for (const [el, n] of Object.entries(getSubstance(id).composition)) {
      diff[el] = (diff[el] ?? 0) + sign * coef * n;
    }
  };
  r.reactants.forEach((t) => add(t.id, t.coef, -1));
  r.products.forEach((t) => add(t.id, t.coef, 1));
  for (const k of Object.keys(diff)) if (diff[k] === 0) delete diff[k];
  return diff;
}

export function equationString(r: ReactionDef, pretty: (f: string) => string = (f) => f): string {
  const side = (ts: { id: string; coef: number }[]) =>
    ts.map((t) => `${t.coef === 1 ? '' : t.coef + ' '}${pretty(getSubstance(t.id).formula)}`).join(' + ');
  return `${side(r.reactants)} → ${side(r.products)}`;
}

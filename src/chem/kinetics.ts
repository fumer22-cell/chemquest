import { R_GAS } from './units';
import { freeLot, newLot, type Lot } from './lot';
import { solubility, substance } from '../data/substances';

/** One term of a reaction equation. */
export interface Term {
  id: string;
  coef: number;
}

/**
 * A scripted reaction with a simple rate law, evaluated in a liquid:
 *   rate (mol/s) = k(T) · catalystFactor · V · Π [i]^order_i
 * with k(T) = k · exp(−Ea/R · (1/T − 1/Tref)) and concentrations in mol/L.
 */
export interface ReactionDef {
  id: string;
  name: string;
  /** Short plain-language description of what it does (shown when you hold a reagent). */
  effect?: string;
  reactants: Term[];
  products: Term[];
  /** kJ per mole of reaction (negative = releases heat). */
  deltaH: number;
  /** Rate constant at refC, units (L/mol)^(Σorder−1)/s. */
  k: number;
  refC: number;
  /** Activation energy, kJ/mol. */
  Ea: number;
  /** Concentration orders. Reactants not listed are order 0 but must be present. */
  orders: Record<string, number>;
  /** Catalyst: without at least `minGrams` of it, the rate is multiplied by `without`. */
  catalyst?: { id: string; minGrams: number; without: number };
  /** Substances that must be present in the liquid (e.g. water). */
  requires?: string[];
  /** No reaction below this temperature (°C). */
  minC?: number;
}

/** Per-container bookkeeping used by the kinetics and by the level's checks. */
export class ChemState {
  /** Highest contents temperature seen (°C). */
  maxC = -Infinity;
  /** Cooling rate (°C per lab minute, positive = cooling), smoothed. */
  coolingRate = 0;
  private lastC: number | null = null;
  /** Lab seconds left of "recently scratched / stirred with a rod". */
  scratch = 0;
  /** 0..1 how vigorously it is being swirled or stirred. */
  stir = 0;
  /** Extent (mol) of each reaction so far. */
  readonly extent = new Map<string, number>();
  /** Largest impurity co-precipitation ratio used while crystals formed. */
  worstInclusion = 0;
  /** Grams crystallised per substance. */
  readonly crystallised = new Map<string, number>();

  track(tC: number, dt: number): void {
    this.maxC = Math.max(this.maxC, tC);
    if (this.lastC !== null && dt > 0) {
      // °C per minute, clamped so a sudden jump (pouring in cold water) doesn't
      // read as minutes of fast cooling; smoothed over about a minute.
      const rate = Math.max(-60, Math.min(60, ((this.lastC - tC) / dt) * 60));
      this.coolingRate += (rate - this.coolingRate) * Math.min(1, dt / 60);
    }
    this.lastC = tC;
    this.scratch = Math.max(0, this.scratch - dt);
  }
}

export interface KineticsOptions {
  reactions: readonly ReactionDef[];
  /** Air flow over a wet solid (1 = still air, higher = vacuum pulling air through). */
  airflow?: number;
}

export interface KineticsResult {
  /** Heat released this step (J). */
  heatJ: number;
  /** Grams of vapour lost from drying solids. */
  driedG: number;
}

const SOLVENTS = ['water', 'ethanol', 'acetic_anhydride', 'acetic_acid'];

/** Liquid-phase substances evaporate from wet solids; solid-phase ones don't. */
const isLiquidPhase = (id: string) => substance(id).phase === 'liquid';

/**
 * Advance the chemistry of one container by dt lab-seconds:
 * reactions (in the liquid, and in the film of liquid on a wet solid),
 * dissolving, crystallising (with impurity inclusion that grows with cooling
 * rate), wet-cake absorption/release, and drying.
 */
export function stepKinetics(
  liquid: Lot,
  solid: Lot,
  tC: number,
  dt: number,
  st: ChemState,
  opts: KineticsOptions,
): KineticsResult {
  let heatJ = 0;
  heatJ += runReactions(liquid, liquid.volumeML() / 1000, tC, dt, st, opts.reactions);
  const filmML = liquidPhaseVolume(solid);
  if (filmML > 0.001) heatJ += runReactions(solid, filmML / 1000, tC, dt, st, opts.reactions, true);
  heatJ += dissolveAndCrystallise(liquid, solid, tC, dt, st);
  wetCake(liquid, solid);
  const driedG = dry(solid, tC, dt, opts.airflow ?? 1);
  return { heatJ, driedG };
}

function liquidPhaseVolume(lot: Lot): number {
  let v = 0;
  for (const id of lot.ids()) {
    if (!isLiquidPhase(id)) continue;
    const s = substance(id);
    v += lot.grams(id) / s.density;
  }
  return v;
}

export function rateConstant(r: ReactionDef, tC: number): number {
  const T = tC + 273.15;
  const Tref = r.refC + 273.15;
  return r.k * Math.exp(((-r.Ea * 1000) / R_GAS) * (1 / T - 1 / Tref));
}

/**
 * Run every reaction in `lot`. In a wet cake (`film`), crystals are not
 * dissolved, so only reactions between liquid-phase substances can happen.
 */
function runReactions(lot: Lot, vL: number, tC: number, dt: number, st: ChemState, reactions: readonly ReactionDef[], film = false): number {
  if (vL <= 1e-6) return 0;
  let heat = 0;
  for (const r of reactions) {
    if (r.minC !== undefined && tC < r.minC) continue;
    if (film && r.reactants.some((t) => !isLiquidPhase(t.id))) continue;
    if (r.reactants.some((t) => lot.mol(t.id) <= 1e-12)) continue;
    if (r.requires?.some((id) => lot.mol(id) <= 1e-12)) continue;
    let rate = rateConstant(r, tC) * vL;
    for (const [id, order] of Object.entries(r.orders)) rate *= Math.pow(lot.mol(id) / vL, order);
    if (r.catalyst && lot.grams(r.catalyst.id) < r.catalyst.minGrams) rate *= r.catalyst.without;
    let x = rate * dt;
    for (const t of r.reactants) x = Math.min(x, lot.mol(t.id) / t.coef);
    if (!(x > 0)) continue;
    for (const t of r.reactants) lot.remove(t.id, t.coef * x);
    for (const t of r.products) lot.add(t.id, t.coef * x);
    st.extent.set(r.id, (st.extent.get(r.id) ?? 0) + x);
    heat += -r.deltaH * 1000 * x;
  }
  return heat;
}

/** Grams of `id` the liquid can hold at tC (additive over the solvents present). */
export function capacityG(liquid: Lot, id: string, tC: number): number {
  let cap = 0;
  for (const solv of SOLVENTS) {
    const g = liquid.grams(solv);
    if (g > 0) cap += (solubility(id, solv, tC) / 100) * g;
  }
  return cap;
}

/** Heat of solution is ignored (small for these solids); returns 0 J. */
function dissolveAndCrystallise(liquid: Lot, solid: Lot, tC: number, dt: number, st: ChemState): number {
  if (liquid.volumeML() < 0.05) return 0;
  const tempFactor = Math.pow(1.04, tC - 25);
  // Solid-phase substances present anywhere.
  const ids = new Set([...liquid.ids(), ...solid.ids()].filter((id) => !isLiquidPhase(id)));
  // Crystallise the most abundant product first so inclusion uses its rate.
  const order = [...ids].sort((a, b) => liquid.grams(b) - liquid.grams(a));
  for (const id of order) {
    const cap = capacityG(liquid, id, tC);
    const dissolved = liquid.grams(id);
    const crystals = solid.grams(id);
    const mw = substance(id).mw;
    if (dissolved < cap && crystals > 0) {
      // Dissolve: faster when warm, stirred, and with more surface.
      const maxRate = 0.006 * Math.pow(crystals, 2 / 3) * tempFactor * (1 + 3 * st.stir);
      const g = Math.min(crystals, cap - dissolved, maxRate * dt);
      liquid.add(id, solid.remove(id, g / mw));
    } else if (dissolved > cap * 1.001) {
      const S = dissolved / Math.max(cap, 1e-9);
      const seeded = crystals > 1e-6 || st.scratch > 0 || S > 1.6 || Math.random() < 0.0015 * (S - 1) * dt;
      if (!seeded) continue;
      const g = Math.min(dissolved - cap, (dissolved - cap) * 0.06 * dt * (crystals > 0.01 ? 1.5 : 1));
      if (g <= 0) continue;
      solid.add(id, liquid.remove(id, g / mw));
      st.crystallised.set(id, (st.crystallised.get(id) ?? 0) + g);
      // Fast cooling traps other dissolved solids in the growing crystals.
      const ratio = Math.min(0.85, 0.04 + 0.035 * Math.max(0, st.coolingRate));
      st.worstInclusion = Math.max(st.worstInclusion, ratio);
      for (const j of ids) {
        if (j === id) continue;
        const dj = liquid.grams(j);
        if (dj <= 0 || dissolved <= 0) continue;
        const gj = Math.min(dj, g * (dj / dissolved) * ratio);
        solid.add(j, liquid.remove(j, gj / substance(j).mw));
      }
    }
  }
  return 0;
}

/** mL of liquid a gram of crystals holds as a wet cake. */
const WET_CAPACITY = 0.5;

/**
 * A little liquid on a lot of crystals soaks in as a wet cake (it moves into the
 * solid lot); enough liquid turns it back into a slurry.
 */
function wetCake(liquid: Lot, solid: Lot): void {
  let crystalG = 0;
  for (const id of solid.ids()) if (!isLiquidPhase(id)) crystalG += solid.grams(id);
  if (crystalG <= 0.001) return;
  const cap = WET_CAPACITY * crystalG;
  const lv = liquid.volumeML();
  const total = lv + liquidPhaseVolume(solid);
  if (lv > 0 && total < cap) {
    solid.mergeFrom(liquid);
  } else if (total > cap * 1.5 && liquidPhaseVolume(solid) > 0) {
    const film = newLot('liquid');
    for (const id of solid.ids()) if (isLiquidPhase(id)) film.add(id, solid.remove(id, solid.mol(id)));
    liquid.mergeFrom(film);
    freeLot(film);
  }
}

/** Volatile liquid on solids evaporates. Returns grams lost. */
function dry(solid: Lot, tC: number, dt: number, airflow: number): number {
  let lost = 0;
  // Still air at room temperature: water e-folds in ~7 min of lab time.
  const k = (1 / 400) * airflow * Math.pow(2, (tC - 25) / 12);
  for (const id of solid.ids()) {
    const s = substance(id);
    if (s.phase !== 'liquid' || s.bp === null) continue;
    const volatility = Math.exp((100 - s.bp) / 40); // water 1, acetic acid ~0.6, Ac2O ~0.37
    const g = solid.grams(id) * Math.min(1, k * volatility * dt);
    solid.remove(id, g / s.mw);
    lost += g;
  }
  return lost;
}

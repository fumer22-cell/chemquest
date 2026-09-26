import {
  AMBIENT_K,
  GasTank,
  Mixture,
  boilOff,
  flameTest,
  getSubstance,
  pH,
  react,
  readBalance,
  readPHMeter,
  readPHPaper,
  relax,
  type FlameResult,
  type ReactionEvent,
} from '../chem';
import { MINERALS, type MineralDef } from '../data/minerals';
import { LAB, STOCKS, TANKS, VESSELS, type VesselDef } from '../data/scenario';
import type { Journal } from './journal';
import type { LifeSupport } from './survival';

export type Tone = 'info' | 'good' | 'warn' | 'danger';

/** What the lab needs from the rest of the game. */
export interface LabHost {
  journal: Journal;
  lifeSupport: LifeSupport;
  log(text: string, tone?: Tone): void;
  hasUpgrade(id: string): boolean;
  addProduct(contents: Mixture, from: string): string | null;
}

export class Stock {
  constructor(
    public id: string,
    private fixedLabel: string | null,
    public contents: Mixture,
    public mineral: MineralDef | null = null,
  ) {}

  label(journal: Journal): string {
    if (this.fixedLabel) return this.fixedLabel;
    const m = this.mineral!;
    return journal.sample(m.id).identified ? `${m.label}: ${m.mineralName} (${getSubstance(m.substanceId).formula})` : `${m.label}`;
  }
}

export class Vessel {
  readonly contents = new Mixture();
  lastPourAt = -Infinity;
  constructor(public def: VesselDef) {}
  get id() {
    return this.def.id;
  }
  grossMass(): number {
    return this.def.glassMassG + this.contents.totalMass();
  }
}

export type SourceRef = { kind: 'stock' | 'vessel'; id: string };

/**
 * The lab bench simulation. Pure logic: the LabScene only calls these methods
 * and draws the results.
 */
export class Lab {
  readonly stocks = new Map<string, Stock>();
  readonly vessels: Vessel[] = VESSELS.map((d) => new Vessel(d));
  readonly h2Tank = GasTank.filled(TANKS.h2.name, TANKS.h2.volumeL, TANKS.h2.ratedAtm, 'H2', TANKS.h2.startAtm);
  readonly o2Tank = new GasTank(TANKS.o2.name, TANKS.o2.volumeL, TANKS.o2.ratedAtm);
  /** Physically strong chamber; the 5 atm limit is for ignition. */
  readonly chamber = new GasTank(TANKS.chamber.name, TANKS.chamber.volumeL, 60);
  readonly chamberIgnitionLimitAtm = TANKS.chamber.ratedAtm;

  scale = { vesselId: 'beaker' as string | null, tareG: 0 };
  burner = { vesselId: 'flask' as string | null, on: false };
  o2TankRepairS = 0;
  recombinerRepairS = 0;
  private time = 0;
  private lastLog = new Map<string, number>();

  constructor(private host: LabHost) {
    for (const s of STOCKS) {
      this.stocks.set(s.id, new Stock(s.id, s.label, Mixture.of(s.amountsMol)));
      for (const id of Object.keys(s.amountsMol)) host.journal.recordSubstance(id, `bottle label: ${s.label}`);
    }
  }

  // ---------- lookup ----------

  vessel(id: string): Vessel {
    const v = this.vessels.find((x) => x.id === id);
    if (!v) throw new Error(`No vessel ${id}`);
    return v;
  }

  sourceMixture(ref: SourceRef): Mixture | null {
    if (ref.kind === 'stock') return this.stocks.get(ref.id)?.contents ?? null;
    return this.vessel(ref.id).contents;
  }

  sourceLabel(ref: SourceRef): string {
    if (ref.kind === 'stock') return this.stocks.get(ref.id)?.label(this.host.journal) ?? '?';
    return this.vessel(ref.id).def.name;
  }

  mineralStock(m: MineralDef): Stock {
    const id = `mineral:${m.id}`;
    let s = this.stocks.get(id);
    if (!s) {
      s = new Stock(id, null, new Mixture(), m);
      this.stocks.set(id, s);
    }
    return s;
  }

  addToStock(stockId: string, amount: number): void {
    const s = this.stocks.get(stockId);
    if (!s) return;
    const main = s.contents.ids()[0] ?? (stockId === 'water' ? 'H2O' : 'KClO3');
    const sub = getSubstance(main);
    // solids in g, liquids in mL (density 1 for water)
    s.contents.add(main, amount / sub.molarMass);
    s.contents.settle(false);
  }

  // ---------- bench actions ----------

  /** Pour for dt seconds. Solids pour by mass, liquids by volume. */
  pour(from: SourceRef, toVesselId: string, dt: number, fine: boolean): void {
    if (from.kind === 'vessel' && from.id === toVesselId) return;
    const src = this.sourceMixture(from);
    if (!src || src.totalMass() < 1e-6) {
      this.logOnce('empty-src', `${this.sourceLabel(from)} is empty.`, 'warn');
      return;
    }
    const target = this.vessel(toVesselId);
    const liquid = src.liquidVolumeML() > 0.5 * src.volumeML();
    let portion: Mixture;
    if (liquid) {
      const rate = fine ? LAB.pourLiquidFineMLPerS : LAB.pourLiquidMLPerS;
      portion = src.takeVolume(Math.min(rate * dt, src.volumeML()));
    } else {
      const rate = fine ? LAB.pourSolidFineGPerS : LAB.pourSolidGPerS;
      portion = src.takeMass(Math.min(rate * dt, src.totalMass()));
    }
    target.contents.merge(portion, target.def.heatCapacity);
    target.lastPourAt = this.time;
    this.processVessel(target);
  }

  dump(vesselId: string): void {
    const v = this.vessel(vesselId);
    if (v.contents.isEmpty()) return;
    v.contents.clear();
    this.host.log(`Emptied the ${v.def.name.toLowerCase()} into the waste drum.`);
  }

  bottle(vesselId: string): void {
    const v = this.vessel(vesselId);
    if (v.contents.isEmpty()) {
      this.host.log('Nothing to bottle.', 'warn');
      return;
    }
    const contents = v.contents.take(1);
    contents.temperatureK = AMBIENT_K;
    const name = this.host.addProduct(contents, v.def.name);
    if (!name) {
      v.contents.merge(contents);
      this.host.log('No empty bottles left — sell or dump one first.', 'warn');
      return;
    }
    v.contents.clear();
    this.host.log(`Bottled the contents of the ${v.def.name.toLowerCase()} as “${name}”.`, 'good');
  }

  flameTest(from: SourceRef): FlameResult | null {
    const src = this.sourceMixture(from);
    if (!src || src.totalMass() < 0.001) {
      this.host.log('Nothing to put in the flame.', 'warn');
      return null;
    }
    const pinch = src.takeMass(Math.min(LAB.flameTestSampleG, src.totalMass()));
    const result = flameTest(pinch);
    const label = this.sourceLabel(from);
    this.host.log(`Flame test of ${label}: ${result.description}.`);

    // Attribute to a mineral if the sample is essentially one mineral.
    const solids = pinch.ids().filter((id) => id !== 'H2O');
    const solidMass = solids.reduce((s, id) => s + pinch.massOf(id), 0);
    const mineral = MINERALS.find((m) => solidMass > 0 && pinch.massOf(m.substanceId) / solidMass > 0.9);
    if (mineral) {
      this.host.journal.recordTest(mineral.id, 'flame', result.description);
    } else if (from.kind === 'stock') {
      this.host.journal.addObservation(`Flame test — ${label}: ${result.description}`);
    }
    return result;
  }

  setOnScale(vesselId: string | null): void {
    this.scale.vesselId = vesselId;
    this.scale.tareG = 0;
  }

  tare(): void {
    const v = this.scale.vesselId ? this.vessel(this.scale.vesselId) : null;
    this.scale.tareG = v ? v.grossMass() : 0;
  }

  balanceReading(): string {
    const v = this.scale.vesselId ? this.vessel(this.scale.vesselId) : null;
    const gross = v ? v.grossMass() : 0;
    const res = this.host.hasUpgrade('precision_balance') ? LAB.precisionResolution : LAB.balanceResolution;
    return readBalance(gross - this.scale.tareG, { resolution: res, capacityG: LAB.balanceCapacityG });
  }

  setOnBurner(vesselId: string | null): void {
    this.burner.vesselId = vesselId;
  }

  pHReading(vesselId: string): { text: string; color: number | null } {
    const p = pH(this.vessel(vesselId).contents);
    if (this.host.hasUpgrade('ph_meter')) return { text: `pH ${readPHMeter(p)}`, color: null };
    const paper = readPHPaper(p);
    return { text: `paper ${paper.value}`, color: paper.color };
  }

  // ---------- gas handling ----------

  valve(which: 'h2' | 'o2', dt: number, fine: boolean): void {
    if (this.recombinerRepairS > 0) {
      this.logOnce('rec-broken', 'The recombiner is still being repaired.', 'warn');
      return;
    }
    const tank = which === 'h2' ? this.h2Tank : this.o2Tank;
    const flow = tank.flowTo(this.chamber, dt, fine ? LAB.valveFineConductance : LAB.valveConductance);
    this.chamber.addGas(flow.amounts());
  }

  ventChamber(): void {
    if (this.chamber.totalMoles() > 0) this.host.log('Chamber purged to the outside.');
    this.chamber.vent();
  }

  ignite(): void {
    if (this.recombinerRepairS > 0) {
      this.host.log('The recombiner is still being repaired.', 'warn');
      return;
    }
    const p = this.chamber.pressureAtm();
    if (p < 0.01) {
      this.host.log('Click. Nothing in the chamber to ignite.', 'warn');
      return;
    }
    const mix = this.chamber.contents;
    const events = react(mix, { spark: true, extraHeatCapacity: 1e6 });
    events.forEach((ev) => this.host.journal.recordReaction(ev));
    if (p > this.chamberIgnitionLimitAtm) {
      this.chamber.vent();
      this.recombinerRepairS = LAB.recombinerRepairS;
      this.host.log(
        `BANG! Ignited at ${p.toFixed(1)} atm — far above the 5.0 atm limit. The chamber seals blew; the charge and any water are lost. Repairs take ${LAB.recombinerRepairS} s.`,
        'danger',
      );
      return;
    }
    const waterMol = mix.moles('H2O');
    const leftover = mix.ids().filter((id) => id !== 'H2O' && mix.moles(id) > 1e-4);
    this.chamber.vent();
    if (waterMol <= 1e-6) {
      this.host.log('The spark crackles, but nothing burns.', 'warn');
      return;
    }
    const mL = waterMol * getSubstance('H2O').molarMass; // 1 g/mL
    this.host.lifeSupport.addWater(mL);
    this.host.log(`Recombiner: +${mL.toFixed(1)} mL of water to the reserve.`, 'good');
    if (leftover.length) {
      this.host.log(
        `Unburnt ${leftover.map((id) => getSubstance(id).formula).join(', ')} was purged and lost.`,
        'warn',
      );
    }
  }

  /** Feed the O₂ tank into life support. Non-oxygen gases are scrubbed out. */
  feedLifeSupport(dt: number): void {
    const total = this.o2Tank.totalMoles();
    if (total < 1e-6) {
      this.logOnce('o2-empty', 'The O₂ tank is empty.', 'warn');
      return;
    }
    const gas = this.o2Tank.withdraw(Math.min(total, LAB.lifeSupportFeedMolPerS * dt));
    this.host.lifeSupport.addO2(gas.moles('O2'));
    for (const id of gas.ids()) {
      if (id === 'O2') continue;
      const toxic = id === 'Cl2';
      this.logOnce(
        `scrub-${id}`,
        toxic
          ? 'Chlorine in the oxygen line! The scrubber catches it, but that tank is contaminated.'
          : `The scrubber removes ${getSubstance(id).name} from the oxygen feed.`,
        toxic ? 'danger' : 'warn',
        8,
      );
    }
  }

  // ---------- simulation ----------

  update(dt: number): void {
    this.time += dt;
    this.o2TankRepairS = Math.max(0, this.o2TankRepairS - dt);
    this.recombinerRepairS = Math.max(0, this.recombinerRepairS - dt);
    for (const v of this.vessels) {
      const c = v.def.heatCapacity;
      const heated = this.burner.on && this.burner.vesselId === v.id;
      if (heated) v.contents.addHeat(LAB.burnerPowerW * dt, c);
      relax(v.contents, dt, LAB.heatLossWPerK, c);
      if (heated || v.contents.temperatureK > AMBIENT_K + 5) this.processVessel(v);
      if (this.time - v.lastPourAt > 0.7 && this.time - v.lastPourAt < 1.5) this.staticMineralTests(v);
    }
  }

  /** Let the contents of a vessel react, boil and release gas. */
  processVessel(v: Vessel): ReactionEvent[] {
    const mix = v.contents;
    const c = v.def.heatCapacity;
    const hadHCl = mix.moles('HCl');
    const events = react(mix, { extraHeatCapacity: c });
    const boiled = boilOff(mix, c);
    if (boiled > 1e-3) this.logOnce(`boil-${v.id}`, `The ${v.def.name.toLowerCase()} is boiling — water is steaming away.`, 'warn', 6);

    const gases = mix.removeGases();
    if (Object.keys(gases).length) this.routeGases(v, gases);

    for (const ev of events) {
      this.host.journal.recordReaction(ev);
      this.logOnce(`rx-${ev.reaction.id}-${v.id}`, `${this.shortName(v)}: ${ev.reaction.observation}`, 'info', 5);
      if (ev.temperatureAfterK - ev.temperatureBeforeK > 25) {
        this.logOnce(`hot-${v.id}`, `The ${v.def.name.toLowerCase()} got hot fast!`, 'warn', 5);
      }
      for (const m of MINERALS) {
        if ((ev.consumed[m.substanceId] ?? 0) > 0 && hadHCl > 0) {
          this.host.journal.recordTest(m.id, 'acid', `Reacts: ${ev.reaction.observation}`, true);
        }
      }
    }

    const vol = mix.volumeML();
    if (vol > v.def.capacityML) {
      mix.take((vol - v.def.capacityML) / vol);
      this.logOnce(`spill-${v.id}`, `The ${v.def.name.toLowerCase()} overflowed! Some of it spilled.`, 'danger', 3);
    }
    return events;
  }

  private routeGases(v: Vessel, gases: Record<string, number>): void {
    if (v.def.gasOutlet !== 'o2') return; // open vessel: gas escapes into the room
    if (this.o2TankRepairS > 0) {
      this.logOnce('o2-venting', 'The O₂ tank is being patched — the gas escapes through the relief valve.', 'warn', 5);
      return;
    }
    const res = this.o2Tank.addGas(gases);
    if (res.ruptured) {
      this.o2TankRepairS = LAB.tankRepairS;
      this.host.log(
        `The O₂ tank burst at ${res.peakAtm.toFixed(1)} atm (rated ${this.o2Tank.ratedAtm} atm)! Everything in it is lost. Patching takes ${LAB.tankRepairS} s.`,
        'danger',
      );
    }
  }

  /** Solubility / acid observations once the liquid has settled after pouring. */
  private staticMineralTests(v: Vessel): void {
    const mix = v.contents;
    if (mix.liquidVolumeML() < 1) return;
    const acid = mix.molarity('HCl') > 0.05;
    for (const m of MINERALS) {
      const n = mix.moles(m.substanceId);
      if (n <= 1e-9) continue;
      const frac = mix.dissolvedMoles(m.substanceId) / n;
      const dissolves =
        frac > 0.9 ? 'Dissolves completely' : frac > 0.01 ? 'Some dissolves, the rest stays (saturated)' : 'Does not dissolve';
      if (acid) {
        this.host.journal.recordTest(
          m.id,
          'acid',
          frac > 0.01 ? `${dissolves} in the acid, with no fizzing.` : 'No visible reaction — the solid just sits in the acid.',
        );
        if (frac > 0.01) this.host.journal.recordTest(m.id, 'water', `${dissolves} (in dilute acid).`);
      } else {
        this.host.journal.recordTest(m.id, 'water', `${dissolves} in water.`);
      }
    }
  }

  private shortName(v: Vessel): string {
    return v.def.name.split(' ')[0];
  }

  private logOnce(key: string, text: string, tone: Tone = 'info', everyS = 3): void {
    const last = this.lastLog.get(key) ?? -Infinity;
    if (this.time - last < everyS) return;
    this.lastLog.set(key, this.time);
    this.host.log(text, tone);
  }
}

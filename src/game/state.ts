import { Mixture, getSubstance } from '../chem';
import { MINERALS, type MineralDef } from '../data/minerals';
import { ORDERS } from '../data/orders';
import { MANUAL_NOTES, START_CREDITS } from '../data/scenario';
import { SHOP } from '../data/shop';
import { Emitter } from './emitter';
import { Journal, type JournalChange } from './journal';
import { Lab, type Tone } from './lab';
import { gradeDelivery, type Grade } from './orders';
import { LifeSupport } from './survival';

export interface Product {
  id: string;
  name: string;
  from: string;
  contents: Mixture;
}

export interface LogEntry {
  text: string;
  tone: Tone;
  time: number;
}

type GameEvents = {
  log: LogEntry;
  journal: JournalChange;
  credits: number;
  status: GameStatus;
};

export type GameStatus = 'playing' | 'dead-o2' | 'dead-water';

const MAX_BOTTLES = 6;

/** All game state, independent of rendering. */
export class GameState {
  readonly events = new Emitter<GameEvents>();
  readonly journal = new Journal((c) => this.events.emit('journal', c));
  readonly lifeSupport = new LifeSupport();
  readonly lab: Lab;
  readonly upgrades = new Set<string>();
  readonly products: Product[] = [];
  readonly completedOrders = new Map<string, Grade>();
  readonly log: LogEntry[] = [];
  credits = START_CREDITS;
  time = 0;
  status: GameStatus = 'playing';
  goalAnnounced = false;
  private bottleCounter = 0;
  private depositCooldown = new Map<string, number>();

  constructor() {
    this.lab = new Lab({
      journal: this.journal,
      lifeSupport: this.lifeSupport,
      log: (t, tone) => this.addLog(t, tone),
      hasUpgrade: (id) => this.upgrades.has(id),
      addProduct: (c, from) => this.addProduct(c, from),
    });
    MANUAL_NOTES.forEach((n) => this.journal.addNote(n));
  }

  addLog(text: string, tone: Tone = 'info'): void {
    const e = { text, tone, time: this.time };
    this.log.push(e);
    if (this.log.length > 200) this.log.shift();
    this.events.emit('log', e);
  }

  update(dt: number): void {
    if (this.status !== 'playing') return;
    this.time += dt;
    this.lab.update(dt);
    const s = this.lifeSupport.tick(dt);
    if (s !== 'ok') {
      this.status = s === 'o2-out' ? 'dead-o2' : 'dead-water';
      this.events.emit('status', this.status);
      return;
    }
    if (this.lifeSupport.goalReached && !this.goalAnnounced) {
      this.goalAnnounced = true;
      this.addLog('Life support is stable: enough oxygen and water stored. You will survive long enough to plan an escape.', 'good');
    }
  }

  // ---------- world ----------

  harvest(mineral: MineralDef): void {
    const ready = this.depositCooldown.get(mineral.id) ?? 0;
    if (this.time < ready) return;
    this.depositCooldown.set(mineral.id, this.time + 0.4);
    const stock = this.lab.mineralStock(mineral);
    stock.contents.add(mineral.substanceId, mineral.gramsPerHarvest / getSubstance(mineral.substanceId).molarMass);
    stock.contents.settle(false);
    this.journal.sample(mineral.id);
    this.addLog(`Collected ${mineral.gramsPerHarvest} g of ${stock.label(this.journal)} — ${mineral.look}.`);
  }

  mineralAt(id: string): MineralDef | undefined {
    return MINERALS.find((m) => m.id === id);
  }

  // ---------- products & trading ----------

  addProduct(contents: Mixture, from: string): string | null {
    if (this.products.length >= MAX_BOTTLES) return null;
    this.bottleCounter++;
    const name = `Bottle ${this.bottleCounter}`;
    this.products.push({ id: `p${this.bottleCounter}`, name, from, contents });
    return name;
  }

  discardProduct(id: string): void {
    const i = this.products.findIndex((p) => p.id === id);
    if (i >= 0) this.products.splice(i, 1);
  }

  openOrders() {
    return ORDERS.filter((o) => !this.completedOrders.has(o.id));
  }

  deliver(orderId: string, productId: string): Grade | null {
    const order = ORDERS.find((o) => o.id === orderId);
    const product = this.products.find((p) => p.id === productId);
    if (!order || !product || this.completedOrders.has(orderId)) return null;
    const grade = gradeDelivery(order, product.contents);
    if (grade.result !== 'rejected') {
      this.completedOrders.set(orderId, grade);
      this.discardProduct(productId);
      this.credits += grade.payment;
      this.events.emit('credits', this.credits);
    }
    return grade;
  }

  buy(itemId: string): string {
    const item = SHOP.find((s) => s.id === itemId);
    if (!item) return 'Unknown item.';
    if (item.kind === 'upgrade' && this.upgrades.has(item.id)) return 'You already own that.';
    if (this.credits < item.price) return `You need ${item.price} cr.`;
    this.credits -= item.price;
    this.events.emit('credits', this.credits);
    if (item.kind === 'upgrade') this.upgrades.add(item.id);
    if (item.supply) this.lab.addToStock(item.supply.stockId, item.supply.amount);
    this.addLog(`Bought: ${item.name}.`, 'good');
    return `Bought ${item.name}.`;
  }
}

let current = new GameState();

export function game(): GameState {
  return current;
}

export function newGame(): GameState {
  current.events.clear();
  current = new GameState();
  return current;
}

import SmilesDrawer from 'smiles-drawer';
import { prettyFormula } from '../chem/formula';
import { substance } from '../data/substances';

type DrawFn = (tree: unknown, c: HTMLCanvasElement, theme: string, infoOnly: boolean) => void;

/**
 * One skeletal-structure display drawn from SMILES. Changing the molecule
 * cross-fades between two stacked canvases.
 */
export class StructureView {
  private current: string | null = null;
  private front: HTMLCanvasElement;
  private back: HTMLCanvasElement;
  private drawer: { draw: DrawFn };

  constructor(
    private root: HTMLElement,
    width: number,
    height: number,
  ) {
    const [a, b] = [...root.querySelectorAll('canvas')] as HTMLCanvasElement[];
    this.front = a;
    this.back = b;
    for (const c of [a, b]) {
      c.width = width;
      c.height = height;
    }
    this.drawer = new SmilesDrawer.Drawer({
      width,
      height,
      bondThickness: 1.3,
      fontSizeLarge: 7,
      fontSizeSmall: 5,
      padding: 10,
    } as object) as unknown as { draw: DrawFn };
  }

  show(substanceId: string | null): void {
    if (this.current === substanceId) return;
    this.current = substanceId;
    this.root.classList.toggle('empty', !substanceId);
    if (!substanceId) {
      this.front.classList.remove('on');
      return;
    }
    const target = this.back;
    SmilesDrawer.parse(
      substance(substanceId).smiles,
      (tree: unknown) => {
        target.getContext('2d')!.clearRect(0, 0, target.width, target.height);
        this.drawer.draw(tree, target, 'dark', false);
        target.classList.add('on');
        this.front.classList.remove('on');
        [this.front, this.back] = [this.back, this.front];
      },
      () => {},
    );
  }
}

/** What one slot of the molecule bar shows. */
export interface MolInfo {
  substanceId: string | null;
  /** Small caps label above the name, e.g. "Working on · 125 mL flask". */
  stage: string;
  /** Override the name line. */
  name?: string;
  /** Composition chips: label and fraction (0..1). */
  mix?: { label: string; frac: number }[];
}

export interface Effect {
  text: string;
  tone: 'good' | 'warn' | 'info';
}

/**
 * The bar across the top: the molecule you are working on (live), what is in
 * your hand, and what adding it would do.
 */
export class MoleculeBar {
  private work: StructureView;
  private hand: StructureView;
  private effectKey = '';

  constructor(private root: HTMLElement) {
    this.work = new StructureView(root.querySelector('#slot-work .mol')!, 300, 150);
    this.hand = new StructureView(root.querySelector('#slot-hand .mol')!, 240, 120);
  }

  update(work: MolInfo | null, hand: MolInfo | null, effect: Effect | null): void {
    this.fill('#slot-work', this.work, work ?? { substanceId: null, stage: 'Working on', name: 'nothing yet' });
    this.fill('#slot-hand', this.hand, hand ?? { substanceId: null, stage: 'In hand', name: 'nothing' });
    this.root.querySelector('#slot-hand')!.classList.toggle('idle', !hand);
    const el = this.root.querySelector('#effect') as HTMLElement;
    const key = effect ? effect.tone + effect.text : '';
    if (key !== this.effectKey) {
      this.effectKey = key;
      el.className = `effect ${effect?.tone ?? ''}`;
      el.innerHTML = effect ? effect.text : '';
    }
  }

  private fill(sel: string, view: StructureView, info: MolInfo): void {
    const slot = this.root.querySelector(sel)!;
    view.show(info.substanceId);
    const s = info.substanceId ? substance(info.substanceId) : null;
    set(slot, '.stage', info.stage);
    set(slot, '.name', info.name ?? s?.name ?? '');
    set(slot, '.formula', s ? `${prettyFormula(s.formula)} · ${s.mw.toFixed(2)} g/mol` : '');
    const mixEl = slot.querySelector('.mix');
    if (mixEl) {
      const html = (info.mix ?? [])
        .map((m) => `<span class="chip"><i style="width:${Math.round(m.frac * 100)}%"></i><b>${m.label}</b> ${Math.round(m.frac * 100)}%</span>`)
        .join('');
      if (mixEl.innerHTML !== html) mixEl.innerHTML = html;
    }
  }
}

function set(root: Element, sel: string, text: string): void {
  const el = root.querySelector(sel);
  if (el && el.textContent !== text) el.textContent = text;
}

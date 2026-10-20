import SmilesDrawer from 'smiles-drawer';
import { prettyFormula } from '../chem/formula';
import { substance } from '../data/substances';

/**
 * Always-visible skeletal structure of the key molecule, drawn from SMILES.
 * Changing the molecule cross-fades to the new structure.
 */
export class StructurePanel {
  private current: string | null = null;
  private front: HTMLCanvasElement;
  private back: HTMLCanvasElement;
  private drawer = new SmilesDrawer.Drawer({
    width: 300,
    height: 150,
    bondThickness: 1.4,
    fontSizeLarge: 7,
    fontSizeSmall: 5,
    padding: 12,
    compactDrawing: false,
  } as object);

  constructor(
    root: HTMLElement,
    private stageEl: HTMLElement,
    private nameEl: HTMLElement,
    private formulaEl: HTMLElement,
  ) {
    this.front = root.querySelector('canvas.a') as HTMLCanvasElement;
    this.back = root.querySelector('canvas.b') as HTMLCanvasElement;
  }

  show(substanceId: string, stage: string): void {
    this.stageEl.textContent = stage;
    if (this.current === substanceId) return;
    this.current = substanceId;
    const s = substance(substanceId);
    this.nameEl.textContent = s.name;
    this.formulaEl.textContent = `${prettyFormula(s.formula)} · ${s.mw.toFixed(2)} g/mol`;
    // Draw into the hidden canvas, then swap.
    const target = this.back;
    const theme = getComputedStyle(document.documentElement).getPropertyValue('--structure-theme').trim() || 'dark';
    SmilesDrawer.parse(
      s.smiles,
      (tree: unknown) => {
        (this.drawer as unknown as { draw: (t: unknown, c: HTMLCanvasElement, theme: string, infoOnly: boolean) => void }).draw(
          tree,
          target,
          theme,
          false,
        );
        target.classList.add('on');
        this.front.classList.remove('on');
        [this.front, this.back] = [this.back, this.front];
      },
      () => {
        this.nameEl.textContent = `${s.name} (structure unavailable)`;
      },
    );
  }
}

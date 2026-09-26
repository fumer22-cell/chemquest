import Phaser from 'phaser';

export const FONT = '"Courier New", Courier, monospace';

export const COLORS = {
  bg: 0x14161d,
  panel: 0x1d212b,
  panelEdge: 0x3a4152,
  text: '#e6e9ef',
  dim: '#8b93a7',
  accent: 0x49b6ff,
  accentText: '#7fd0ff',
  good: '#7ee081',
  warn: '#ffcc66',
  danger: '#ff6b6b',
  button: 0x2b3242,
  buttonHover: 0x38425a,
  buttonActive: 0x2f6f9f,
  buttonDisabled: 0x22262f,
};

export const toneColor = (tone: string) =>
  tone === 'good' ? COLORS.good : tone === 'warn' ? COLORS.warn : tone === 'danger' ? COLORS.danger : COLORS.text;

export function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  str: string,
  size = 14,
  color: string = COLORS.text,
  extra: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, ...extra });
}

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, title?: string) {
  const g = scene.add.graphics();
  g.fillStyle(COLORS.panel, 1).fillRect(x, y, w, h);
  g.lineStyle(2, COLORS.panelEdge, 1).strokeRect(x, y, w, h);
  if (title) text(scene, x + 8, y + 5, title, 13, COLORS.dim);
  return g;
}

export interface ButtonOpts {
  onClick?: () => void;
  fontSize?: number;
  color?: number;
}

/**
 * Rectangular text button. `held` is true while the pointer is down on it,
 * so scenes can implement hold-to-pour in update().
 */
export class Button extends Phaser.GameObjects.Container {
  held = false;
  private bg: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private selected = false;
  private enabled = true;
  private hover = false;
  private baseColor: number;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, str: string, opts: ButtonOpts = {}) {
    super(scene, x, y);
    this.baseColor = opts.color ?? COLORS.button;
    this.bg = scene.add.rectangle(0, 0, w, h, this.baseColor).setOrigin(0).setStrokeStyle(1, COLORS.panelEdge);
    this.label = text(scene, w / 2, h / 2, str, opts.fontSize ?? 13).setOrigin(0.5);
    this.add([this.bg, this.label]);
    this.setSize(w, h);
    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on('pointerover', () => ((this.hover = true), this.refresh()));
    this.bg.on('pointerout', () => ((this.hover = false), (this.held = false), this.refresh()));
    this.bg.on('pointerdown', () => {
      if (!this.enabled) return;
      this.held = true;
      opts.onClick?.();
      // The click handler may have rebuilt the UI and destroyed this button.
      if (this.scene) this.refresh();
    });
    this.bg.on('pointerup', () => ((this.held = false), this.refresh()));
    const release = () => (this.held = false);
    scene.input.on('pointerup', release);
    this.once('destroy', () => scene.input?.off('pointerup', release));
    scene.add.existing(this);
  }

  setLabel(s: string): this {
    if (this.label.text !== s) this.label.setText(s);
    return this;
  }

  setActiveState(on: boolean): this {
    if (this.selected !== on) {
      this.selected = on;
      this.refresh();
    }
    return this;
  }

  setEnabled(on: boolean): this {
    if (this.enabled !== on) {
      this.enabled = on;
      if (!on) this.held = false;
      this.refresh();
    }
    return this;
  }

  private refresh(): void {
    if (!this.scene) return;
    const c = !this.enabled
      ? COLORS.buttonDisabled
      : this.selected || this.held
        ? COLORS.buttonActive
        : this.hover
          ? COLORS.buttonHover
          : this.baseColor;
    this.bg.setFillStyle(c);
    this.label.setColor(this.enabled ? COLORS.text : COLORS.dim);
  }
}

export function button(scene: Phaser.Scene, x: number, y: number, w: number, h: number, str: string, opts: ButtonOpts = {}) {
  return new Button(scene, x, y, w, h, str, opts);
}

/** Round-dial pressure gauge with a red zone above the rating. */
export class Gauge {
  private g: Phaser.GameObjects.Graphics;
  private readout: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    private x: number,
    private y: number,
    private r: number,
    title: string,
    private maxAtm: number,
    private redAtm: number,
  ) {
    this.g = scene.add.graphics();
    text(scene, x, y - r - 22, title, 12, COLORS.dim).setOrigin(0.5, 0);
    this.readout = text(scene, x, y + r * 0.5, '', 13, COLORS.text, { backgroundColor: '#0e1016' }).setOrigin(0.5, 0);
  }

  draw(atm: number, reading: string, broken = false): void {
    const { g, x, y, r } = this;
    const a0 = Phaser.Math.DegToRad(135);
    const span = Phaser.Math.DegToRad(270);
    const ang = (p: number) => a0 + span * Math.min(1, Math.max(0, p / this.maxAtm));
    g.clear();
    g.fillStyle(0x0e1016, 1).fillCircle(x, y, r);
    g.lineStyle(2, broken ? 0xff6b6b : 0x5a6275, 1).strokeCircle(x, y, r);
    g.lineStyle(5, 0x3c7a4a, 1).beginPath().arc(x, y, r - 6, a0, ang(this.redAtm)).strokePath();
    g.lineStyle(5, 0xa33b3b, 1).beginPath().arc(x, y, r - 6, ang(this.redAtm), a0 + span).strokePath();
    g.lineStyle(1, 0x8b93a7, 1);
    for (let i = 0; i <= 10; i++) {
      const a = a0 + (span * i) / 10;
      g.lineBetween(x + Math.cos(a) * (r - 12), y + Math.sin(a) * (r - 12), x + Math.cos(a) * (r - 3), y + Math.sin(a) * (r - 3));
    }
    const a = ang(atm);
    g.lineStyle(3, 0xffd166, 1).lineBetween(x, y, x + Math.cos(a) * (r - 10), y + Math.sin(a) * (r - 10));
    g.fillStyle(0xffd166, 1).fillCircle(x, y, 4);
    this.readout.setText(broken ? 'REPAIR' : reading);
    this.readout.setColor(atm > this.redAtm ? COLORS.danger : COLORS.text);
  }
}

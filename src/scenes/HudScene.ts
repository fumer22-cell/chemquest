import Phaser from 'phaser';
import { SURVIVAL } from '../data/scenario';
import { game, type LogEntry } from '../game/state';
import { COLORS, FONT, text, toneColor } from '../ui/widgets';

/**
 * Always-on overlay: advances game time, shows survival meters, credits,
 * the interaction prompt and message toasts, and opens the journal.
 */
export class HudScene extends Phaser.Scene {
  private bars!: Phaser.GameObjects.Graphics;
  private o2Text!: Phaser.GameObjects.Text;
  private waterText!: Phaser.GameObjects.Text;
  private goalText!: Phaser.GameObjects.Text;
  private creditText!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private toasts: { t: Phaser.GameObjects.Text; born: number }[] = [];
  private unsub: (() => void)[] = [];
  private journalFlash = 0;
  private journalText!: Phaser.GameObjects.Text;

  constructor() {
    super('Hud');
  }

  create(): void {
    this.toasts = [];
    const bar = this.add.graphics();
    bar.fillStyle(0x0b0d12, 0.92).fillRect(0, 0, 1280, 34);
    bar.lineStyle(1, COLORS.panelEdge).lineBetween(0, 34, 1280, 34);
    this.bars = this.add.graphics();
    this.o2Text = text(this, 10, 9, '', 14);
    this.waterText = text(this, 290, 9, '', 14);
    this.goalText = text(this, 590, 9, '', 13, COLORS.dim);
    this.creditText = text(this, 1010, 9, '', 14, '#ffd166');
    this.journalText = text(this, 1130, 9, '[J] Journal', 14, COLORS.accentText);
    this.prompt = this.add
      .text(640, 690, '', {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5);

    const g = game();
    this.unsub.push(g.events.on('log', (e) => this.toast(e)));
    this.unsub.push(
      g.events.on('journal', () => {
        this.journalFlash = 2.5;
      }),
    );
    this.unsub.push(
      g.events.on('status', (s) => {
        if (s !== 'playing') {
          this.scene.stop('Journal');
          this.scene.launch('End', { status: s });
        }
      }),
    );
    this.events.once('shutdown', () => this.unsub.forEach((u) => u()));

    this.input.keyboard!.on('keydown-J', () => this.toggleJournal());
  }

  toggleJournal(): void {
    if (this.scene.isActive('End')) return;
    if (this.scene.isActive('Journal')) this.scene.stop('Journal');
    else this.scene.launch('Journal');
  }

  private toast(e: LogEntry): void {
    if (this.registry.get('toasts') === false) return;
    const t = this.add
      .text(1270, 0, e.text, {
        fontFamily: FONT,
        fontSize: '13px',
        color: toneColor(e.tone),
        backgroundColor: '#0b0d12dd',
        padding: { x: 6, y: 3 },
        wordWrap: { width: 460 },
      })
      .setOrigin(1, 0);
    this.toasts.push({ t, born: this.time.now });
    while (this.toasts.length > 4) this.toasts.shift()!.t.destroy();
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(0.1, deltaMs / 1000);
    const g = game();
    g.update(dt);

    const ls = g.lifeSupport;
    const p = ls.goalProgress();
    this.bars.clear();
    const drawBar = (x: number, frac: number, color: number) => {
      this.bars.fillStyle(0x2a2f3b).fillRect(x, 12, 90, 10);
      this.bars.fillStyle(color).fillRect(x, 12, 90 * Math.min(1, frac), 10);
    };
    const o2Low = ls.o2Minutes() < 5;
    const wLow = ls.waterMinutes() < 5;
    drawBar(185, p.o2, o2Low ? 0xff6b6b : 0x49b6ff);
    drawBar(470, p.water, wLow ? 0xff6b6b : 0x5fd39a);
    const blink = Math.floor(this.time.now / 400) % 2 === 0;
    this.o2Text.setText(`O₂ ${ls.o2Minutes().toFixed(1)} min`).setColor(o2Low && blink ? COLORS.danger : COLORS.text);
    this.waterText.setText(`Water ${ls.waterML.toFixed(0)} mL`).setColor(wLow && blink ? COLORS.danger : COLORS.text);
    this.goalText.setText(
      ls.goalReached
        ? 'Life support stable ✓'
        : `Goal: O₂ ≥ ${SURVIVAL.goalO2Minutes} min, water ≥ ${SURVIVAL.goalWaterML} mL`,
    );
    this.goalText.setColor(ls.goalReached ? COLORS.good : COLORS.dim);
    this.creditText.setText(`${g.credits} cr`);

    this.journalFlash = Math.max(0, this.journalFlash - dt);
    this.journalText.setColor(this.journalFlash > 0 && blink ? '#ffffff' : COLORS.accentText);
    this.journalText.setText(this.journalFlash > 0 ? '[J] Journal ✎' : '[J] Journal');

    const promptStr = (this.registry.get('prompt') as string) ?? '';
    this.prompt.setText(promptStr).setVisible(promptStr.length > 0);

    // Stack and fade toasts.
    let y = 42;
    for (const toast of [...this.toasts]) {
      const age = (this.time.now - toast.born) / 1000;
      if (age > 7 || this.registry.get('toasts') === false) {
        toast.t.destroy();
        this.toasts.splice(this.toasts.indexOf(toast), 1);
        continue;
      }
      toast.t.setY(y).setAlpha(age > 6 ? 7 - age : 1);
      y += toast.t.height + 4;
    }
  }
}

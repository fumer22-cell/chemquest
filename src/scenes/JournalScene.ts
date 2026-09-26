import Phaser from 'phaser';
import { allSubstances, getSubstance, prettyFormula } from '../chem';
import { game } from '../game/state';
import { COLORS, FONT, button, text } from '../ui/widgets';

type Tab = 'substances' | 'reactions' | 'samples' | 'notes';

/** Overlay listing everything the player has discovered. */
export class JournalScene extends Phaser.Scene {
  private tab: Tab = 'samples';
  private body!: Phaser.GameObjects.Text;
  private tabs: Record<Tab, ReturnType<typeof button>> = {} as never;
  private scroll = 0;

  constructor() {
    super('Journal');
  }

  create(): void {
    if (!game().journal.samples.size && this.tab === 'samples') this.tab = 'notes';
    this.add.rectangle(0, 34, 1280, 686, 0x000000, 0.75).setOrigin(0).setInteractive();
    this.add.rectangle(90, 50, 1100, 650, 0x201c16).setOrigin(0).setStrokeStyle(3, 0x8a6a3a);
    text(this, 110, 62, 'FIELD JOURNAL', 22, '#f2d59b');
    text(this, 1170, 66, '[J] / [Esc] close   wheel: scroll', 12, COLORS.dim).setOrigin(1, 0);
    const names: [Tab, string][] = [
      ['samples', 'Samples'],
      ['substances', 'Substances'],
      ['reactions', 'Reactions'],
      ['notes', 'Notes'],
    ];
    names.forEach(([t, label], i) => {
      this.tabs[t] = button(this, 110 + i * 140, 100, 130, 28, label, {
        onClick: () => {
          this.tab = t;
          this.scroll = 0;
          this.render();
        },
      });
    });
    this.body = this.add.text(114, 142, '', {
      fontFamily: FONT,
      fontSize: '14px',
      color: '#efe6d2',
      wordWrap: { width: 1050 },
      lineSpacing: 4,
    });
    const mask = this.make.graphics({}, false).fillRect(100, 138, 1080, 552).createGeometryMask();
    this.body.setMask(mask);
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const max = Math.max(0, this.body.height - 540);
      this.scroll = Phaser.Math.Clamp(this.scroll + dy * 0.6, 0, max);
      this.body.setY(142 - this.scroll);
    });
    this.input.keyboard!.on('keydown-ESC', () => this.scene.stop());
    const unsub = game().events.on('journal', () => this.render());
    this.events.once('shutdown', () => {
      unsub();
      this.input.keyboard!.removeAllListeners('keydown-ESC');
    });
    this.render();
  }

  private render(): void {
    (Object.keys(this.tabs) as Tab[]).forEach((t) => this.tabs[t].setActiveState(t === this.tab));
    this.body.setText(this.content());
    this.body.setY(142 - this.scroll);
  }

  private content(): string {
    const j = game().journal;
    if (this.tab === 'samples') {
      if (!j.samples.size) return 'No samples collected yet. Walk up to a mineral deposit and press E.';
      return [...j.samples.values()]
        .map((s) => {
          const lines = [`■ ${s.mineral.label} — ${s.mineral.look}`];
          const t = s.tests;
          lines.push(`   Flame test:     ${t.flame ?? '—'}`);
          lines.push(`   Water:          ${t.water ?? '—'}`);
          lines.push(`   Hydrochloric acid: ${t.acid ?? '—'}`);
          lines.push(s.identified ? `   ✓ ${s.mineral.conclusion}` : '   Not yet identified.');
          return lines.join('\n');
        })
        .join('\n\n');
    }
    if (this.tab === 'substances') {
      const known = allSubstances().filter((s) => j.knowsSubstance(s.id));
      return known
        .map(
          (s) =>
            `${prettyFormula(s.formula).padEnd(8)} ${s.name} — ${s.molarMass.toFixed(2)} g/mol\n` +
            `         ${s.appearance}${s.density ? `; density ${s.density} g/mL` : ''}` +
            `${s.solubility ? `; dissolves up to ${s.solubility} g per 100 g water` : s.state === 'solid' ? '; insoluble in water' : ''}\n` +
            `         (${j.substances.get(s.id)})`,
        )
        .join('\n\n');
    }
    if (this.tab === 'reactions') {
      if (!j.reactions.size) return 'No reactions observed yet.';
      return [...j.reactions.values()]
        .map(
          (r) =>
            `■ ${r.name}\n   ${r.equation}\n   Seen: ${r.observation}\n   ${r.exothermic ? 'Releases heat (exothermic).' : 'Absorbs heat (endothermic).'}  Observed ${r.timesSeen}×`,
        )
        .join('\n\n');
    }
    const notes = j.notes.map((n) => `■ ${n.title}\n   ${n.text}`).join('\n\n');
    const obs = j.observations.length ? '\n\n■ Your observations\n' + j.observations.map((o) => `   • ${o}`).join('\n') : '';
    const ref = `\n\n■ Useful constants\n   R = 0.08206 L·atm/(mol·K)    0 °C = 273.15 K    water: 1.00 g/mL\n   ${getSubstance('H2O').name} boils at 100 °C`;
    return notes + obs + ref;
  }
}

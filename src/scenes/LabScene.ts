import Phaser from 'phaser';
import { getSubstance, readPressure, readThermometer, readVolume } from '../chem';
import { LAB } from '../data/scenario';
import type { SourceRef, Vessel } from '../game/lab';
import { game } from '../game/state';
import { Button, COLORS, FONT, Gauge, button, panel, text, toneColor } from '../ui/widgets';

const CARD_W = 168;
const CARD_H = 360;
const CARD_X0 = 260;
const CARD_Y0 = 44;

interface Card {
  vessel: Vessel;
  x: number;
  g: Phaser.GameObjects.Graphics;
  vol: Phaser.GameObjects.Text;
  temp: Phaser.GameObjects.Text;
  ph: Phaser.GameObjects.Text;
  badges: Phaser.GameObjects.Text;
  fromBtn: Button;
  intoBtn: Button;
  scaleBtn: Button;
  heatBtn: Button;
  phBtn: Button;
  paper: { text: string; color: number | null; until: number } | null;
  bubbles: { x: number; y: number; v: number }[];
}

/** Half-widths (px) of each vessel's inside, bottom row first. */
function profile(kind: string): number[] {
  const rows: number[] = [];
  if (kind === 'beaker') for (let i = 0; i < 130; i++) rows.push(46);
  else if (kind === 'cylinder') for (let i = 0; i < 150; i++) rows.push(15);
  else if (kind === 'tube') {
    for (let i = 0; i < 120; i++) rows.push(i < 12 ? Math.sqrt(144 - (12 - i) ** 2) : 12);
  } else {
    for (let i = 0; i < 96; i++) rows.push(Math.sqrt(48 * 48 - (i - 48) ** 2));
    for (let i = 0; i < 50; i++) rows.push(10);
  }
  return rows;
}

export class LabScene extends Phaser.Scene {
  private from: SourceRef | null = null;
  private into: string | null = null;
  private cards: Card[] = [];
  private shelf: { id: string; btn: Button }[] = [];
  private shelfKey = '';
  private pourBtn!: Button;
  private dripBtn!: Button;
  private selText!: Phaser.GameObjects.Text;
  private balanceText!: Phaser.GameObjects.Text;
  private balanceOn!: Phaser.GameObjects.Text;
  private burnerBtn!: Button;
  private burnerText!: Phaser.GameObjects.Text;
  private flameG!: Phaser.GameObjects.Graphics;
  private flameText!: Phaser.GameObjects.Text;
  private flame: { color: string | null; until: number } | null = null;
  private gauges!: { h2: Gauge; o2: Gauge; ch: Gauge };
  private gasBtns!: { h2: Button; o2: Button; ls: Button };
  private chamberInfo!: Phaser.GameObjects.Text;
  private logTexts: Phaser.GameObjects.Text[] = [];
  private keys!: { space: Phaser.Input.Keyboard.Key; shift: Phaser.Input.Keyboard.Key };
  private unsub: (() => void)[] = [];

  constructor() {
    super('Lab');
  }

  create(): void {
    this.registry.set('toasts', false);
    this.registry.set('prompt', '');
    this.cards = [];
    this.shelf = [];
    this.shelfKey = '';
    this.logTexts = [];
    this.from = null;
    this.into = 'beaker';

    this.add.rectangle(0, 34, 1280, 686, COLORS.bg).setOrigin(0);
    panel(this, 8, 40, 244, 364, 'SHELF — click to pour FROM');
    game().lab.vessels.forEach((v, i) => this.makeCard(v, i));
    this.makeInstruments();
    this.makePourBar();
    this.makeGasPanel();
    this.makeLog();

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({ space: 'SPACE', shift: 'SHIFT' }) as typeof this.keys;
    kb.on('keydown-ESC', () => this.leave());
    ['ONE', 'TWO', 'THREE', 'FOUR'].forEach((k, i) =>
      kb.on(`keydown-${k}`, () => {
        const v = game().lab.vessels[i];
        if (v) this.into = v.id;
      }),
    );
    this.unsub.push(game().events.on('log', () => this.refreshLog()));
    this.events.once('shutdown', () => {
      this.unsub.forEach((u) => u());
      this.unsub = [];
      this.input.keyboard!.removeAllListeners();
    });
    this.refreshLog();
  }

  private leave(): void {
    if (this.scene.isActive('Journal')) return;
    game().lab.burner.on = false;
    this.scene.start('World');
  }

  // ---------- construction ----------

  private rebuildShelf(): void {
    const lab = game().lab;
    const ids = [...lab.stocks.keys()];
    const j = game().journal;
    const key = ids.map((id) => lab.stocks.get(id)!.label(j)).join('|');
    if (key === this.shelfKey) return;
    this.shelfKey = key;
    this.shelf.forEach((s) => s.btn.destroy());
    this.shelf = ids.map((id, i) => {
      const btn = button(this, 16, 62 + i * 42, 228, 38, '', {
        fontSize: 12,
        onClick: () => (this.from = { kind: 'stock', id }),
      });
      return { id, btn };
    });
  }

  private makeCard(v: Vessel, i: number): void {
    const x = CARD_X0 + i * (CARD_W + 8);
    const y = CARD_Y0;
    panel(this, x, y - 4, CARD_W, CARD_H + 4);
    text(this, x + 6, y, `${i + 1}. ${v.def.name}`, 12, COLORS.text, { wordWrap: { width: CARD_W - 12 } });
    const g = this.add.graphics();
    if (v.def.gasOutlet) text(this, x + CARD_W - 8, y + 16, 'sealed: gas → O₂ tank', 11, COLORS.dim).setOrigin(1, 0);
    const vol = text(this, x + 8, y + 206, '', 13);
    const temp = text(this, x + 8, y + 222, '', 13);
    const ph = text(this, x + 8, y + 240, '', 13);
    const badges = text(this, x + 8, y + 258, '', 11, COLORS.warn);
    const bw = 76;
    const b = (bx: number, by: number, label: string, fn: () => void) =>
      button(this, x + bx, y + by, bw, 24, label, { onClick: fn, fontSize: 12 });
    const card: Card = {
      vessel: v,
      x,
      g,
      vol,
      temp,
      ph,
      badges,
      fromBtn: b(8, 276, 'From', () => (this.from = { kind: 'vessel', id: v.id })),
      intoBtn: b(84, 276, 'Into', () => (this.into = v.id)),
      scaleBtn: b(8, 304, 'Balance', () => {
        const lab = game().lab;
        lab.setOnScale(lab.scale.vesselId === v.id ? null : v.id);
      }),
      heatBtn: b(84, 304, 'Hot plate', () => {
        const lab = game().lab;
        lab.setOnBurner(lab.burner.vesselId === v.id ? null : v.id);
      }),
      phBtn: button(this, x + 120, y + 237, 40, 20, 'pH', {
        fontSize: 11,
        onClick: () => {
          const r = game().lab.pHReading(v.id);
          card.paper = { ...r, until: this.time.now + 6000 };
        },
      }),
      paper: null,
      bubbles: [],
    };
    b(8, 332, 'Bottle', () => game().lab.bottle(v.id));
    b(84, 332, 'Dump', () => game().lab.dump(v.id));
    this.cards.push(card);
  }

  private makeInstruments(): void {
    const x = 972;
    panel(this, x, 40, 300, 364, 'INSTRUMENTS');
    text(this, x + 10, 62, 'Balance', 13, COLORS.dim);
    this.add.rectangle(x + 10, 80, 280, 42, 0x0c1a12).setOrigin(0).setStrokeStyle(1, 0x2f5a3d);
    this.balanceText = text(this, x + 280, 84, '', 28, '#8cff9e').setOrigin(1, 0);
    this.balanceOn = text(this, x + 10, 126, '', 12, COLORS.dim);
    button(this, x + 210, 124, 80, 22, 'Tare', { onClick: () => game().lab.tare(), fontSize: 12 });

    text(this, x + 10, 158, `Hot plate (${LAB.burnerPowerW} W, max ≈ 350 °C)`, 13, COLORS.dim);
    this.burnerBtn = button(this, x + 10, 178, 80, 26, 'OFF', {
      onClick: () => {
        const lab = game().lab;
        lab.burner.on = !lab.burner.on;
      },
    });
    this.burnerText = text(this, x + 98, 180, '', 12, COLORS.text, { wordWrap: { width: 190 } });

    text(this, x + 10, 222, 'Flame test (pinch of the FROM sample)', 13, COLORS.dim);
    button(this, x + 10, 244, 120, 26, 'Flame test', {
      onClick: () => {
        if (!this.from) {
          game().addLog('Choose a FROM sample first (shelf or a vessel).', 'warn');
          return;
        }
        const r = game().lab.flameTest(this.from);
        if (r) {
          this.flame = { color: r.color, until: this.time.now + 4000 };
          this.flameText.setText(r.description);
        }
      },
    });
    this.flameG = this.add.graphics();
    this.flameText = text(this, x + 10, 276, '', 12, COLORS.text, { wordWrap: { width: 170 } });

    button(this, x + 10, 368, 280, 28, '← Leave lab  [Esc]', { onClick: () => this.leave() });
  }

  private makePourBar(): void {
    panel(this, 8, 410, 956, 54);
    this.selText = text(this, 18, 418, '', 14);
    text(this, 18, 440, 'Hold Space to pour, Shift+Space to drip. Keys 1–4 pick the INTO vessel.', 12, COLORS.dim);
    this.pourBtn = button(this, 720, 418, 116, 38, 'POUR (hold)');
    this.dripBtn = button(this, 842, 418, 116, 38, 'DRIP (hold)');
  }

  private makeGasPanel(): void {
    panel(this, 8, 470, 694, 244, 'GAS HANDLING — tanks at 20 °C');
    const lab = game().lab;
    this.gauges = {
      h2: new Gauge(this, 95, 562, 50, 'H₂ tank · 10 L', lab.h2Tank.ratedAtm * 1.2, lab.h2Tank.ratedAtm),
      o2: new Gauge(this, 265, 562, 50, 'O₂ tank · 5 L', lab.o2Tank.ratedAtm * 1.2, lab.o2Tank.ratedAtm),
      ch: new Gauge(this, 435, 562, 50, 'Chamber · 20 L', 8, lab.chamberIgnitionLimitAtm),
    };
    this.gasBtns = {
      h2: button(this, 30, 628, 130, 28, 'H₂ → chamber', { fontSize: 12 }),
      o2: button(this, 200, 628, 130, 28, 'O₂ → chamber', { fontSize: 12 }),
      ls: button(this, 200, 664, 130, 28, 'O₂ → life supp.', { fontSize: 12 }),
    };
    button(this, 372, 628, 62, 28, 'IGNITE', { fontSize: 12, color: 0x6a2b2b, onClick: () => game().lab.ignite() });
    button(this, 438, 628, 62, 28, 'Purge', { fontSize: 12, onClick: () => game().lab.ventChamber() });
    this.chamberInfo = text(this, 520, 500, '', 12, COLORS.text, { wordWrap: { width: 175 } });
    text(
      this,
      520,
      600,
      'Valves: hold the button.\nHold Shift too for\nfine control.\n\nRecombiner: burns\nH₂ + O₂ → water,\nthen purges.',
      11,
      COLORS.dim,
    );
    text(this, 30, 670, 'Salvaged fuel tank', 11, COLORS.dim);
  }

  private makeLog(): void {
    panel(this, 708, 470, 564, 244, 'LAB NOTEBOOK (latest at bottom)');
  }

  private refreshLog(): void {
    this.logTexts.forEach((t) => t.destroy());
    this.logTexts = [];
    const entries = game().log.slice(-14);
    let y = 706;
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      const t = this.add.text(716, y, e.text, {
        fontFamily: FONT,
        fontSize: '12px',
        color: toneColor(e.tone),
        wordWrap: { width: 548 },
      });
      t.setY(y - t.height);
      y -= t.height + 3;
      if (y < 490) {
        t.destroy();
        break;
      }
      this.logTexts.push(t);
    }
  }

  // ---------- per-frame ----------

  update(_t: number, deltaMs: number): void {
    const dt = Math.min(0.1, deltaMs / 1000);
    const g = game();
    const lab = g.lab;
    const blocked = this.scene.isActive('Journal') || this.scene.isActive('End');

    this.rebuildShelf();
    for (const s of this.shelf) {
      const st = lab.stocks.get(s.id)!;
      s.btn.setLabel(`${st.label(g.journal)}\n${this.remaining(st.contents)}`);
      s.btn.setActiveState(this.from?.kind === 'stock' && this.from.id === s.id);
    }

    // Pouring
    const shift = this.keys.shift.isDown;
    const pourHeld = !blocked && (this.pourBtn.held || this.dripBtn.held || this.keys.space.isDown);
    const fine = this.dripBtn.held || (this.keys.space.isDown && shift);
    this.pourBtn.setActiveState(pourHeld && !fine);
    this.dripBtn.setActiveState(pourHeld && fine);
    if (pourHeld && this.from && this.into) {
      if (this.from.kind === 'vessel' && this.from.id === this.into) {
        // no-op: can't pour into itself
      } else lab.pour(this.from, this.into, dt, fine);
    }
    const fromLabel = this.from ? lab.sourceLabel(this.from) : '— pick a bottle or vessel —';
    const intoLabel = this.into ? lab.vessel(this.into).def.name : '—';
    this.selText.setText(`FROM: ${fromLabel}   →   INTO: ${intoLabel}`);

    // Gas valves
    if (!blocked) {
      if (this.gasBtns.h2.held) lab.valve('h2', dt, shift);
      if (this.gasBtns.o2.held) lab.valve('o2', dt, shift);
      if (this.gasBtns.ls.held) lab.feedLifeSupport(dt);
    }
    this.gauges.h2.draw(lab.h2Tank.pressureAtm(), readPressure(lab.h2Tank.pressureAtm()));
    this.gauges.o2.draw(lab.o2Tank.pressureAtm(), readPressure(lab.o2Tank.pressureAtm()), lab.o2TankRepairS > 0);
    this.gauges.ch.draw(lab.chamber.pressureAtm(), readPressure(lab.chamber.pressureAtm()), lab.recombinerRepairS > 0);
    this.chamberInfo.setText(
      lab.recombinerRepairS > 0
        ? `Recombiner under repair: ${lab.recombinerRepairS.toFixed(0)} s`
        : `Ignition limit ${lab.chamberIgnitionLimitAtm.toFixed(1)} atm.\n\nTank relief: O₂ tank bursts above ${lab.o2Tank.ratedAtm} atm.` +
            (lab.o2TankRepairS > 0 ? `\n\nO₂ tank patching: ${lab.o2TankRepairS.toFixed(0)} s` : ''),
    );

    // Instruments
    this.balanceText.setText(lab.balanceReading());
    this.balanceOn.setText(lab.scale.vesselId ? `on pan: ${lab.vessel(lab.scale.vesselId).def.name}` : 'pan empty');
    this.burnerBtn.setLabel(lab.burner.on ? 'ON' : 'OFF').setActiveState(lab.burner.on);
    const hv = lab.burner.vesselId ? lab.vessel(lab.burner.vesselId) : null;
    this.burnerText.setText(hv ? `under: ${hv.def.name}\n${readThermometer(hv.contents.temperatureK)}` : 'nothing on the plate');
    this.drawFlame();

    for (const c of this.cards) this.drawCard(c, dt);
  }

  private remaining(m: import('../chem').Mixture): string {
    if (m.isEmpty()) return 'empty';
    if (m.liquidVolumeML() > 0.5 * m.volumeML()) {
      const v = m.volumeML();
      return `≈ ${v >= 100 ? Math.round(v / 10) * 10 : Math.round(v)} mL left`;
    }
    const g = m.totalMass();
    return `≈ ${g >= 100 ? Math.round(g / 10) * 10 : Math.round(g)} g left`;
  }

  private drawFlame(): void {
    const g = this.flameG;
    g.clear();
    const x = 1230;
    const y = 300;
    g.fillStyle(0x555b66).fillRect(x - 10, y + 20, 20, 40);
    const active = this.flame && this.time.now < this.flame.until;
    const flicker = 1 + Math.sin(this.time.now / 60) * 0.08;
    g.fillStyle(0x3d7bff, 0.8).fillEllipse(x, y + 8, 18, 30 * flicker);
    if (active) {
      const col = this.flame!.color ? Phaser.Display.Color.HexStringToColor(this.flame!.color).color : 0xff8a3d;
      g.fillStyle(col, 0.9).fillEllipse(x, y - 14, 34 * flicker, 70 * flicker);
      g.fillStyle(0xffffff, 0.35).fillEllipse(x, y - 4, 12, 26);
    } else if (this.flame) {
      this.flame = null;
      this.flameText.setText('');
    }
  }

  private drawCard(c: Card, dt: number): void {
    const lab = game().lab;
    const v = c.vessel;
    const mix = v.contents;
    const g = c.g;
    g.clear();
    const cx = c.x + CARD_W / 2;
    const bottom = CARD_Y0 + 196;
    const rows = profile(v.def.kind);
    const onScale = lab.scale.vesselId === v.id;
    const onBurner = lab.burner.vesselId === v.id;

    // Balance pan / hot plate under the vessel.
    if (onScale) g.fillStyle(0x9aa3b2).fillRect(cx - 55, bottom + 2, 110, 5);
    if (onBurner) {
      g.fillStyle(0x3a3f4b).fillRect(cx - 55, bottom + 1, 110, 7);
      if (lab.burner.on) g.fillStyle(0xff5a1f, 0.6 + 0.2 * Math.sin(this.time.now / 150)).fillRect(cx - 50, bottom + 1, 100, 3);
    }

    // Fill level by volume fraction, following the vessel's shape.
    const area = rows.reduce((s, w) => s + w, 0);
    const volFrac = Math.min(1, mix.volumeML() / v.def.capacityML);
    let solidVol = 0;
    let solidColor = 0xffffff;
    let biggest = 0;
    for (const id of mix.ids()) {
      const s = getSubstance(id);
      if (s.state !== 'solid') continue;
      const sv = (mix.undissolvedMoles(id) * s.molarMass) / (s.density ?? 2);
      solidVol += sv;
      if (sv > biggest) (biggest = sv), (solidColor = s.color);
    }
    const solidFrac = Math.min(volFrac, solidVol / v.def.capacityML);
    let liquidColor = 0x7fc4ff;
    for (const id of mix.ids()) {
      const s = getSubstance(id);
      if (s.solutionColor && mix.dissolvedMoles(id) > 1e-4) liquidColor = s.solutionColor;
    }
    let cum = 0;
    let levelRow = 0;
    for (let i = 0; i < rows.length; i++) {
      cum += rows[i];
      const f = cum / area;
      if (f <= volFrac + 1e-9) {
        const isSolid = f <= solidFrac + 1e-9;
        g.fillStyle(isSolid ? solidColor : liquidColor, isSolid ? 1 : 0.7);
        g.fillRect(cx - rows[i], bottom - i - 1, rows[i] * 2, 1);
        levelRow = i;
      }
    }

    // Bubbles while reacting or boiling.
    const hot = mix.temperatureK > 368 && mix.waterMoles() > 0;
    const reacting = v.lastReactionAt !== undefined && lab.clock - v.lastReactionAt < 0.6;
    if ((hot || reacting) && volFrac > 0.02 && Math.random() < 0.6) {
      c.bubbles.push({ x: cx + (Math.random() - 0.5) * rows[0] * 1.6, y: bottom - 2, v: 30 + Math.random() * 40 });
    }
    const surface = bottom - levelRow - 1;
    c.bubbles = c.bubbles.filter((b) => (b.y -= b.v * dt) > surface);
    g.fillStyle(0xffffff, 0.8);
    c.bubbles.forEach((b) => g.fillCircle(b.x, b.y, 2));

    // Glass outline.
    const tempC = mix.temperatureK - 273.15;
    const glassCol = tempC > 150 ? 0xff7b54 : tempC > 60 ? 0xffc38a : 0xcfe8ff;
    const pts: Phaser.Math.Vector2[] = [];
    rows.forEach((w, i) => pts.push(new Phaser.Math.Vector2(cx - w - 2, bottom - i)));
    for (let i = rows.length - 1; i >= 0; i--) pts.push(new Phaser.Math.Vector2(cx + rows[i] + 2, bottom - i));
    g.lineStyle(2, glassCol, 0.9).strokePoints(pts, false);
    g.lineBetween(cx - rows[0] - 2, bottom, cx + rows[0] + 2, bottom);
    if (v.def.kind === 'cylinder') {
      g.lineStyle(1, 0xcfe8ff, 0.6);
      for (let i = 1; i < 10; i++) {
        const yy = bottom - (rows.length * i) / 10;
        g.lineBetween(cx + 8, yy, cx + 17, yy);
      }
      g.fillStyle(0xcfe8ff, 0.8).fillRect(cx - 30, bottom, 60, 4);
    }
    if (v.def.kind === 'beaker') {
      g.lineStyle(1, 0xcfe8ff, 0.5);
      for (let i = 1; i < 6; i++) g.lineBetween(cx - 46, bottom - (130 * i) / 6, cx - 36, bottom - (130 * i) / 6);
    }
    if (v.def.gasOutlet) {
      const top = bottom - rows.length;
      g.lineStyle(3, 0x9aa3b2, 1).lineBetween(cx, top, cx, top - 10).lineBetween(cx, top - 10, c.x + CARD_W - 6, top - 10);
    }

    c.vol.setText(`Vol: ${mix.isEmpty() ? 'empty' : readVolume(mix.volumeML(), v.def.kind)}`);
    c.temp.setText(`T: ${readThermometer(mix.temperatureK)}`);
    const meter = game().upgrades.has('ph_meter');
    c.phBtn.setVisible(!meter);
    if (meter) {
      c.ph.setText(lab.pHReading(v.id).text).setColor(COLORS.text);
    } else if (c.paper && this.time.now < c.paper.until) {
      c.ph.setText(`pH ${c.paper.text}`);
      c.ph.setColor(c.paper.color !== null ? '#' + c.paper.color.toString(16).padStart(6, '0') : COLORS.text);
    } else {
      c.ph.setText('pH: —').setColor(COLORS.dim);
    }
    const badges = [onScale ? '[ON BALANCE]' : '', onBurner ? (lab.burner.on ? '[HEATING]' : '[ON PLATE]') : ''];
    c.badges.setText(badges.filter(Boolean).join(' '));
    c.fromBtn.setActiveState(this.from?.kind === 'vessel' && this.from.id === v.id);
    c.intoBtn.setActiveState(this.into === v.id);
    c.scaleBtn.setActiveState(onScale);
    c.heatBtn.setActiveState(onBurner);
  }
}

import { LAB_SECONDS_PER_TICK } from '../config';
import { newLot, type Lot } from '../chem/lot';
import { GLASSWARE } from '../data/glassware';
import { PROCEDURE, REACTIONS, STEPS, STOCKS } from '../data/levels/aspirin';
import { substance } from '../data/substances';
import { addToInventory } from '../game/inventory';
import { buildDebrief, analyseProduct, type AspirinRecord } from '../levels/aspirinDebrief';
import { Container } from '../sim/container';
import { Tool } from '../sim/tools';
import { World, type Equipment } from '../sim/world';
import { showModal } from '../ui/modal';
import { tempReading, volumeReading } from '../ui/readings';
import type { AppContext, Mode } from './mode';

type Tone = 'info' | 'warn' | 'bad' | 'good';

/**
 * Level 1: aspirin. Instruction mode shows the written procedure and checks
 * steps off as you do them; anything you do differently simply happens.
 * `challenge` (preview) hides the procedure and shows only the target.
 */
export class AspirinMode implements Mode {
  id: string;
  title: string;
  private ctx!: AppContext;
  private F!: Container; // 125 mL reaction flask
  private F50!: Container; // 50 mL recrystallisation flask
  private CYL!: Container;
  private B!: Container; // Büchner funnel
  private WG!: Container; // watch glass
  private tubes: Container[] = [];
  private stocks: Container[] = [];
  private hood!: Equipment;
  private mp!: Equipment;
  /** Grams of each substance delivered into each container. */
  private added = new Map<number, Map<string, number>>();
  private done: boolean[] = [];
  private safetyShown = new Set<number>();
  private notes: { text: string; tone: Tone }[] = [];
  private stepsKey = '';
  private finished = false;
  private lastHoodWarning = -Infinity;
  private rec!: AspirinRecord;
  private flags = {
    coldWaterStarted: false,
    postHeatWaterG: 0,
    saDissolvedNoted: false,
    crystalsNoted: false,
    hotNoted: false,
    quenchNoted: false,
    f50Dissolved: false,
    f50Crystals: false,
    filteredCrude: false,
    pureFiltered: false,
    mpRunning: false,
    productShown: false,
    weighed: false,
  };

  constructor(private challenge = false) {
    this.id = challenge ? 'challenge' : 'aspirin';
    this.title = challenge ? 'Challenge (preview)' : 'Level 1 · Aspirin';
  }

  // ---------- setup ----------

  enter(ctx: AppContext): void {
    this.ctx = ctx;
    ctx.world.dispose();
    const w = new World();
    ctx.world = w;
    w.reactions = REACTIONS;
    this.rec = {
      saAddedG: 0, ac2oAddedG: 0, catalystG: 0, heatSeconds: 0, maxReactionC: 22, quenchWaterG: 0,
      ac2oAtColdWaterG: null, ac2oAtFiltrationG: null, recrystallised: false, worstInclusion: 0, washWaterG: 0, spilledML: 0,
      labSeconds: 0, hoodViolations: 0, aspirinMadeMol: 0, sideMadeMol: 0, hydrolysedMol: 0,
      mpMeasured: false, fecl3Result: null,
    };
    this.done = STEPS.map(() => false);

    // Fume hood: a tall alcove on the left with its own work surface.
    this.hood = w.equip({ id: 'hood', kind: 'hood', label: 'Fume hood', x: 2, y: 2, w: 72, h: 88 });
    w.equip({ id: 'hoodfloor', kind: 'shelf', label: 'Hood work surface', x: 4, y: 86, w: 68, h: 4 });
    w.equip({ id: 'shelf', kind: 'shelf', label: 'Shelf', x: 78, y: 44, w: 240, h: 4 });
    w.equip({ id: 'balance', kind: 'balance', label: 'Balance', x: 78, y: 152, w: 34, h: 12, tare: 0 });
    w.equip({ id: 'bath', kind: 'bath', label: 'Water bath', x: 168, y: 128, w: 56, h: 36, levelY: 138, setpoint: PROCEDURE.bathC });
    w.equip({ id: 'ice', kind: 'bath', label: 'Ice bath', x: 226, y: 132, w: 60, h: 32, levelY: 140, temp: 1, setpoint: 1, fixedTemp: true });
    w.equip({ id: 'waste', kind: 'waste', label: 'Waste', x: 40, y: 140, w: 30, h: 24 });
    w.equip({ id: 'stand', kind: 'stand', label: 'Filter stand (vacuum)', x: 288, y: 131, w: 30, h: 2 });
    this.mp = w.equip({ id: 'mp', kind: 'mp', label: 'Melting-point apparatus', x: 288, y: 32, w: 30, h: 12, display: '---' });

    // Stock bottles.
    this.stocks = [];
    const xs: Record<string, [number, number]> = {
      ac2o: [14, 60], sa: [90, 20], h3po4: [112, 20], water: [134, 20], etoh: [156, 20], fecl3: [178, 20],
    };
    for (const s of STOCKS) {
      const [bx, by] = xs[s.id];
      const b = new Container(GLASSWARE.bottle, bx, by, s.label);
      b.tag = s.tag;
      if (s.liquid) {
        const l = newLot('liquid');
        for (const [id, g] of Object.entries(s.liquid)) l.addGrams(id, g);
        b.fill(l, 'liquid');
      }
      if (s.solid) {
        const l = newLot('solid');
        for (const [id, g] of Object.entries(s.solid)) l.addGrams(id, g);
        b.fill(l, 'solid');
      }
      this.stocks.push(w.add(b));
    }

    this.CYL = w.add(new Container(GLASSWARE.cylinder10, 34, 60));
    this.tubes = [w.add(new Container(GLASSWARE.testTube, 196, 20, 'Test tube A')), w.add(new Container(GLASSWARE.testTube, 205, 20, 'Test tube B'))];
    this.WG = w.add(new Container(GLASSWARE.watchGlass, 228, 30));
    this.F50 = w.add(new Container(GLASSWARE.erlenmeyer50, 263, 20, '50 mL Erlenmeyer (recrystallisation)'));
    this.F = w.add(new Container(GLASSWARE.erlenmeyer125, 140, 120, '125 mL Erlenmeyer (reaction flask)'));
    const iw = w.add(new Container(GLASSWARE.beaker50, 244, 120, 'Ice-cold water'));
    const cold = newLot('liquid');
    cold.addGrams('water', 40);
    iw.fill(cold, 'liquid', 1);
    w.add(new Container(GLASSWARE.erlenmeyer50, 302, 140, 'Filter flask'));
    this.B = w.add(new Container(GLASSWARE.buchner, 303, 110));

    w.tools = [new Tool('pipette', 10, 139, 'Pipette A'), new Tool('pipette', 17, 139, 'Pipette B'), new Tool('rod', 24, 133), new Tool('spatula', 31, 141)];
    w.onDeliver = (c, parcel) => this.onDeliver(c, parcel);

    ctx.structure.show('salicylic_acid', this.challenge ? 'Target: aspirin. Starting material' : 'Starting material');
    this.buildPanel();
    this.note(this.challenge ? 'Goggles on. No procedure this time: make aspirin.' : 'Goggles on. Read step 1, then begin.', 'info');
    if (!this.challenge) void this.intro();
  }

  private async intro(): Promise<void> {
    this.ctx.paused = true;
    await showModal({
      title: 'Level 1: Synthesis of aspirin',
      html: `<p>Acetylate <b>salicylic acid</b> with <b>acetic anhydride</b>, using phosphoric acid as a catalyst. Then isolate, purify and test your aspirin.</p>
        <p>The procedure on the right checks off as you work. You can deviate from it, and the chemistry will play out.</p>
        <ul>
          <li><b>Drag</b> glassware to move it. <b>Right-drag</b> it, or hold it and use the wheel or <kbd>Q</kbd>/<kbd>E</kbd>, to tilt and pour.</li>
          <li><b>Pipettes:</b> drag the tip into a liquid and click it to fill, then click over a flask for one drop. <kbd>Space</kbd> also squeezes while you hold it.</li>
          <li><b>Spatula:</b> click with its tip in crystals to scoop them up (<kbd>Shift</kbd>+click for just a pinch), then click over another vessel to tip them out.</li>
          <li><b>Glass rod:</b> drag it inside a flask to stir. Rubbing it on the glass scratches, which starts crystals forming.</li>
          <li>Shake a held vessel (rock it quickly) to knock stuck crystals loose.</li>
          <li>Hover anything to read its volume and temperature. Use fast-forward while you wait.</li>
        </ul>`,
      buttons: [{ label: 'Start', primary: true, value: 'ok' }],
    });
    this.ctx.paused = false;
  }

  // ---------- events ----------

  private addedG(c: Container, id: string): number {
    return this.added.get(c.id)?.get(id) ?? 0;
  }

  private onDeliver(c: Container, parcel: Lot): void {
    let m = this.added.get(c.id);
    if (!m) this.added.set(c.id, (m = new Map()));
    for (const id of parcel.ids()) m.set(id, (m.get(id) ?? 0) + parcel.grams(id));

    // Neat acetic anhydride poured outside the hood (counted once per pour).
    const outside = c.x < this.hood.x || c.x > this.hood.x + this.hood.w;
    if (parcel.massFraction('acetic_anhydride') > 0.5 && outside && !this.stocks.includes(c)) {
      const now = this.ctx.world.labTime;
      if (now - this.lastHoodWarning > 10) {
        if (this.rec.hoodViolations === 0) this.note('Acetic anhydride vapour on the open bench! Pour it in the fume hood.', 'bad');
        this.rec.hoodViolations++;
      }
      this.lastHoodWarning = now;
    }
    const water = parcel.grams('water');
    const total = parcel.totalGrams();
    if (c === this.F && water > 0 && this.rec.heatSeconds > 120) {
      if (!this.flags.coldWaterStarted && this.F.tempC > 40 && this.flags.postHeatWaterG < 3) this.rec.quenchWaterG += water;
      this.flags.postHeatWaterG += water;
      if (!this.flags.coldWaterStarted && this.flags.postHeatWaterG >= 3) {
        this.flags.coldWaterStarted = true;
        this.rec.ac2oAtColdWaterG = this.F.liquid.grams('acetic_anhydride') + this.F.solid.grams('acetic_anhydride');
      }
    }
    if (c === this.B && water / total > 0.95 && this.B.solid.grams('aspirin') > 0.3) this.rec.washWaterG += water;
    if (c === this.B && parcel.mol('aspirin') > 0 && this.rec.ac2oAtFiltrationG === null && !this.flags.f50Dissolved) {
      this.rec.ac2oAtFiltrationG = this.F.liquid.grams('acetic_anhydride') + this.F.solid.grams('acetic_anhydride') + parcel.grams('acetic_anhydride');
    }
  }

  private note(text: string, tone: Tone = 'info'): void {
    this.notes.push({ text, tone });
    if (this.notes.length > 40) this.notes.shift();
    this.renderNotes();
  }

  // ---------- per frame ----------

  frame(ctx: AppContext): void {
    if (ctx.paused || this.finished) return;
    const dt = ctx.speed * LAB_SECONDS_PER_TICK;
    const F = this.F;
    const r = this.rec;
    r.labSeconds = ctx.world.labTime;
    r.saAddedG = this.addedG(F, 'salicylic_acid');
    r.ac2oAddedG = this.addedG(F, 'acetic_anhydride');
    r.catalystG = this.addedG(F, 'phosphoric_acid');
    if (F.restOn === 'bath' && F.tempC >= 60) r.heatSeconds += dt;
    if (!this.flags.coldWaterStarted && r.quenchWaterG < 0.3) r.maxReactionC = Math.max(r.maxReactionC, F.tempC);
    r.spilledML = ctx.world.losses.spilledML;
    r.aspirinMadeMol = F.chem.extent.get('acetylation') ?? 0;
    let side = 0;
    let hyd = 0;
    for (const c of ctx.world.containers) {
      side += (c.chem.extent.get('assa') ?? 0) + (c.chem.extent.get('decomposition') ?? 0);
      hyd += c.chem.extent.get('aspirin_hydrolysis') ?? 0;
    }
    r.sideMadeMol = side;
    r.hydrolysedMol = hyd;
    r.worstInclusion = this.F50.chem.worstInclusion;

    // Observations.
    const saMol = r.saAddedG / substance('salicylic_acid').mw;
    if (!this.flags.saDissolvedNoted && r.saAddedG > 0.5 && F.liquid.volumeML() > 1 && F.solid.grams('salicylic_acid') < 0.02) {
      this.flags.saDissolvedNoted = true;
      this.note('The salicylic acid has dissolved. The mixture is clear.', 'info');
    }
    if (!this.flags.hotNoted && F.tempC > 88 && !this.flags.coldWaterStarted && r.quenchWaterG < 0.3) {
      this.flags.hotNoted = true;
      this.note(`The reaction mixture is at ${F.tempC.toFixed(0)} °C. That is too hot.`, 'warn');
    }
    if (!this.flags.quenchNoted && (F.chem.extent.get('anhydride_hydrolysis') ?? 0) > 0.005 && F.tempC > 60) {
      this.flags.quenchNoted = true;
      this.note('Hiss and steam: the leftover anhydride reacts with the water. The fumes smell of vinegar.', 'info');
    }
    if (!this.flags.crystalsNoted && F.solid.grams('aspirin') > 0.2) {
      this.flags.crystalsNoted = true;
      this.note('White crystals are forming in the reaction flask.', 'good');
    }
    if (!this.flags.productShown && saMol > 0 && r.aspirinMadeMol / saMol > 0.5) {
      this.flags.productShown = true;
      ctx.structure.show('aspirin', 'Product forming');
    }
    const f50 = this.F50;
    if (!this.flags.f50Dissolved && this.addedG(f50, 'ethanol') > 1.5 && f50.liquid.grams('aspirin') > 0.8 && f50.solid.grams('aspirin') < 0.03) {
      this.flags.f50Dissolved = true;
      this.note('The crude crystals have all dissolved.', 'info');
    }
    if (this.flags.f50Dissolved && !this.flags.f50Crystals && f50.solid.grams('aspirin') > 0.5) {
      this.flags.f50Crystals = true;
      this.note('Fine needles of aspirin are growing in the 50 mL flask.', 'good');
    }
    if (this.flags.f50Dissolved && f50.solid.grams('aspirin') > 0.3) r.recrystallised = true;
    for (const t of this.tubes) {
      if (this.addedG(t, 'ferric_chloride') > 0 && r.fecl3Result === null && t.liquid.volumeML() > 0.2) {
        const solids = this.addedG(t, 'aspirin') + this.addedG(t, 'salicylic_acid');
        if (solids <= 0) continue;
        const violet = t.liquid.mol('iron_salicylate') > 2e-7;
        r.fecl3Result = violet ? 'violet' : 'yellow';
        this.note(violet ? 'FeCl₃ test: the tube turns violet. Salicylic acid is present.' : 'FeCl₃ test: it stays pale yellow. No salicylic acid detected.', violet ? 'warn' : 'good');
      }
    }
  }

  // ---------- steps ----------

  private stepChecks(): boolean[] {
    const F = this.F;
    const r = this.rec;
    const cyl = this.CYL.liquid.volumeML() > 4.5 && this.CYL.liquid.massFraction('acetic_anhydride') > 0.9;
    const wgSolid = this.WG.solid;
    const wgCrystals = wgSolid.totalGrams() > 0.3;
    const wgDry = wgCrystals && analyseProduct(wgSolid).wetFraction < 0.02;
    const bHasCrystals = this.B.solid.grams('aspirin') > 0.8;
    const bDrained = this.B.liquid.volumeML() < 1;
    if (bHasCrystals && bDrained) {
      if (!this.flags.f50Dissolved) this.flags.filteredCrude = true;
      else if (r.recrystallised) this.flags.pureFiltered = true;
    }
    if (wgCrystals && this.WG.restOn === 'balance') this.flags.weighed = true;
    return [
      r.saAddedG >= 1.8,
      cyl || r.ac2oAddedG >= 4.5 * 1.082,
      r.ac2oAddedG >= 4.5 * 1.082,
      r.catalystG >= 0.1,
      r.heatSeconds >= PROCEDURE.heatMinutes * 60 * 0.9,
      r.quenchWaterG >= 0.8,
      this.flags.postHeatWaterG >= 15 && F.solid.grams('aspirin') > 1 && F.chem.maxC > 0 && F.tempC < 8,
      this.flags.filteredCrude,
      r.washWaterG >= 8,
      r.recrystallised,
      this.flags.pureFiltered,
      wgDry,
      this.flags.weighed,
      r.mpMeasured && r.fecl3Result !== null,
    ];
  }

  // ---------- panel ----------

  private buildPanel(): void {
    const p = this.ctx.panel;
    p.innerHTML = `
      <h2>${this.title}</h2>
      ${
        this.challenge
          ? '<p class="hint"><b>Challenge mode preview.</b> No procedure, only the target. Make aspirin from what is on the shelf, then finish to see how you did. (The full Challenge mode is planned.)</p>'
          : `<div class="group"><h3>Procedure</h3><ol class="steps" id="steps"></ol></div>`
      }
      <div class="group">
        <h3>Water bath</h3>
        <div class="row"><label for="bath-set">Setpoint</label><output id="bath-out"></output></div>
        <input id="bath-set" type="range" min="25" max="99" step="1" />
        <div class="row"><button id="bath-on">Turn on</button><span class="stat" id="bath-temp"></span></div>
      </div>
      <div class="group">
        <h3>Bench</h3>
        <div class="row"><button id="tare">Tare balance</button><button id="vac">Vacuum: off</button><button id="mp-run">Run melting point</button></div>
        <div class="row" id="speed"></div>
      </div>
      <div class="group"><h3>Lab notebook</h3><div class="notebook" id="notebook"></div></div>
      <div class="row"><button id="finish" class="primary">Finish and analyse</button><button id="restart">Restart level</button><button id="mute">Sound on</button></div>`;
    const $ = <T extends HTMLElement>(id: string) => p.querySelector(`#${id}`) as T;
    const w = () => this.ctx.world;
    const bath = () => w().equipmentById('bath')!;
    const set = $<HTMLInputElement>('bath-set');
    set.value = String(bath().setpoint);
    set.oninput = () => (bath().setpoint = +set.value);
    $('bath-on').onclick = () => (bath().on = !bath().on);
    $('tare').onclick = () => {
      const bal = w().equipmentById('balance')!;
      const on = w().containers.find((c) => c.restOn === 'balance' && !c.held);
      bal.tare = on ? on.grossMass() : 0;
    };
    $('vac').onclick = () => {
      const st = w().equipmentById('stand')!;
      st.on = !st.on;
    };
    $('mp-run').onclick = () => void this.runMeltingPoint();
    const speed = $('speed');
    for (const n of [1, 4, 16]) {
      const b = document.createElement('button');
      b.textContent = n === 1 ? 'Real pace' : `${n}× faster`;
      b.dataset.speed = String(n);
      b.onclick = () => (this.ctx.speed = n);
      speed.append(b);
    }
    $('finish').onclick = () => void this.finish();
    $('restart').onclick = () => this.ctx.restart();
    const mute = $('mute');
    mute.onclick = () => {
      this.ctx.sfx.muted = !this.ctx.sfx.muted;
      mute.textContent = this.ctx.sfx.muted ? 'Sound off' : 'Sound on';
    };
    this.refresh(this.ctx);
    this.renderNotes();
  }

  private renderNotes(): void {
    const el = this.ctx?.panel.querySelector('#notebook');
    if (!el) return;
    el.innerHTML = this.notes.map((n) => `<div class="${n.tone}">${n.text}</div>`).join('');
    el.scrollTop = el.scrollHeight;
  }

  refresh(ctx: AppContext): void {
    const p = ctx.panel;
    const w = ctx.world;
    const bath = w.equipmentById('bath')!;
    const stand = w.equipmentById('stand')!;
    const setText = (id: string, t: string) => {
      const el = p.querySelector(`#${id}`);
      if (el && el.textContent !== t) el.textContent = t;
    };
    setText('bath-out', `${bath.setpoint} °C`);
    setText('bath-on', bath.on ? 'Turn off' : 'Turn on');
    p.querySelector('#bath-on')?.classList.toggle('on', bath.on);
    setText('bath-temp', `water ${bath.temp.toFixed(1)} °C`);
    setText('vac', `Vacuum: ${stand.on ? 'on' : 'off'}`);
    p.querySelector('#vac')?.classList.toggle('on', stand.on);
    const mpBtn = p.querySelector('#mp-run') as HTMLButtonElement | null;
    if (mpBtn) mpBtn.disabled = this.flags.mpRunning || !w.containers.some((c) => c.restOn === 'mp' && c.solid.totalGrams() > 0.01);
    p.querySelectorAll<HTMLButtonElement>('#speed button').forEach((b) => b.classList.toggle('on', +b.dataset.speed! === ctx.speed));

    if (this.challenge || this.finished) return;
    const checks = this.stepChecks();
    checks.forEach((c, i) => {
      if (c) this.done[i] = true;
    });
    const current = this.done.findIndex((d) => !d);
    const key = this.done.map((d) => (d ? 1 : 0)).join('') + current;
    if (key !== this.stepsKey) {
      this.stepsKey = key;
      const list = p.querySelector('#steps');
      if (list) {
        list.innerHTML = STEPS.map((s, i) => {
          const cls = this.done[i] ? 'done' : i === current ? 'current' : '';
          const detail =
            i === current ? `<div class="detail">${s.detail}${s.safety.length ? `<br><button data-safety="${i}">Safety notes</button>` : ''}</div>` : '';
          return `<li class="${cls}"><span>${s.title}</span>${detail}</li>`;
        }).join('');
        list.querySelectorAll<HTMLButtonElement>('button[data-safety]').forEach((b) => (b.onclick = () => void this.showSafety(+b.dataset.safety!)));
        list.querySelector('li.current')?.scrollIntoView({ block: 'nearest' });
      }
      if (current >= 0 && !this.safetyShown.has(current) && STEPS[current].safety.length && current > 0) void this.showSafety(current);
      if (current === 0 && !this.safetyShown.has(0)) this.safetyShown.add(0);
    }
  }

  private async showSafety(i: number): Promise<void> {
    this.safetyShown.add(i);
    const s = STEPS[i];
    const was = this.ctx.paused;
    this.ctx.paused = true;
    await showModal({
      title: `Safety: ${s.title}`,
      html: `<ul class="safety">${s.safety.map((x) => `<li>${x}</li>`).join('')}</ul>`,
      buttons: [{ label: 'Got it', primary: true, value: 'ok' }],
    });
    this.ctx.paused = was;
  }

  // ---------- instruments ----------

  private async runMeltingPoint(): Promise<void> {
    const c = this.ctx.world.containers.find((x) => x.restOn === 'mp' && x.solid.totalGrams() > 0.01);
    if (!c) return;
    const a = analyseProduct(c.solid);
    this.flags.mpRunning = true;
    const e = this.mp;
    const start = performance.now();
    const target = a.mpHigh + 3;
    await new Promise<void>((resolve) => {
      const tick = () => {
        const t = (performance.now() - start) / 1000;
        e.temp = Math.min(target, 22 + t * 25);
        e.display = e.temp < a.mpLow ? `${Math.round(e.temp)}°` : 'MELT';
        if (e.temp >= target) resolve();
        else requestAnimationFrame(tick);
      };
      tick();
    });
    e.display = `${Math.round(a.mpLow)}-${Math.round(a.mpHigh)}`;
    this.flags.mpRunning = false;
    if (c === this.WG) this.rec.mpMeasured = true;
    this.note(`Melting point: ${a.mpLow.toFixed(1)}–${a.mpHigh.toFixed(1)} °C (pure aspirin: 135–136 °C).`, a.mpLow > 132 ? 'good' : 'warn');
    setTimeout(() => (e.temp = 22), 4000);
  }

  // ---------- end ----------

  private productLot(): Lot | null {
    if (this.WG.solid.totalGrams() > 0.05) return this.WG.solid;
    let best: Container | null = null;
    for (const c of this.ctx.world.containers) {
      if (this.stocks.includes(c)) continue;
      if (!best || c.solid.grams('aspirin') > best.solid.grams('aspirin')) best = c;
    }
    return best && best.solid.grams('aspirin') > 0.05 ? best.solid : null;
  }

  private async finish(): Promise<void> {
    this.ctx.paused = true;
    const product = this.productLot();
    const d = buildDebrief(product, this.rec);
    const a = d.analysis;
    const score = (k: string, v: string, n = '') => `<div class="score"><div class="k">${k}</div><div class="v">${v}</div><div class="n">${n}</div></div>`;
    const html = `
      <div class="scores">
        ${score('Yield', a ? `${d.yieldPct.toFixed(0)} %` : '—', a ? `${a.aspirinG.toFixed(2)} g of ${d.theoreticalG.toFixed(2)} g theoretical` : 'no product')}
        ${score('Purity', a ? `${(a.purity * 100).toFixed(0)} %` : '—', a ? `product mass ${a.massG.toFixed(2)} g` : '')}
        ${score('Melting point', a ? `${a.mpLow.toFixed(0)}–${a.mpHigh.toFixed(0)} °C` : '—', 'lit. 135–136 °C')}
        ${score('Time', d.timeText.replace(' of lab time', ''), 'lab time')}
      </div>
      <p><b>Melting point:</b> ${d.mpText}<br><b>Ferric chloride test:</b> ${d.fecl3Text}</p>
      <h3>What happened</h3>
      ${
        d.findings.length
          ? d.findings.map((f) => `<div class="mistake"><b>${f.title}</b><span class="n">${f.detail}</span><p>${f.explain}</p></div>`).join('')
          : '<p>No mistakes. That was a textbook synthesis.</p>'
      }
      ${d.good.length ? `<h3>What went well</h3>${d.good.map((g) => `<div class="mistake ok">${g}</div>`).join('')}` : ''}
    `;
    const choice = await showModal({
      title: 'Debrief: aspirin',
      html,
      wide: true,
      buttons: [
        { label: 'Keep working', value: 'back' },
        { label: 'Save product and restart', primary: true, value: 'save' },
      ],
    });
    if (choice === 'save' && product && a) {
      const comp: Record<string, number> = {};
      for (const id of product.ids()) comp[id] = product.grams(id);
      addToInventory({ id: 'aspirin', name: 'Aspirin', grams: a.massG, purity: a.purity, composition: comp, madeAt: Date.now() });
      this.ctx.restart();
      return;
    }
    this.ctx.paused = false;
  }

  // ---------- hover ----------

  tooltip(c: Container): string {
    const looks: string[] = [];
    if (c.liquid.volumeML() > 0.02) {
      const [r, g, b] = c.liquid.rgba();
      const coloured = Math.max(r, g, b) - Math.min(r, g, b) > 60 && !(b > r && b > g);
      looks.push(coloured ? 'coloured solution' : 'clear liquid');
    }
    if (c.solid.totalGrams() > 0.005) looks.push(c.solid.massFraction('tar') > 0.02 ? 'brownish crystals' : 'white crystals');
    const into = this.added.get(c.id);
    const names = into ? [...into.keys()].filter((id) => (into.get(id) ?? 0) > 0.001).map((id) => substance(id).name) : [];
    const stock = this.stocks.includes(c);
    return `<b>${c.label}</b>\n${stock ? 'Stock bottle' : `Volume: ${volumeReading(c)}`}\nTemp: ${tempReading(c.tempC)}${
      looks.length && !stock ? `\nLooks: ${looks.join(' with ')}` : ''
    }${names.length && !stock ? `\nYou added: ${names.slice(0, 5).join(', ')}` : ''}`;
  }

  toolTooltip(t: Tool): string {
    if (t.kind === 'rod') return `<b>${t.label}</b>\nDrag inside a flask to stir; rub the glass to scratch.`;
    if (t.kind === 'spatula') {
      return `<b>${t.label}</b>\n${t.lot && !t.lot.isEmpty() ? 'Loaded with crystals' : 'Empty'}\nClick with the tip in crystals to scoop (Shift+click for a pinch); click again to tip them out.`;
    }
    const drops = Math.round(t.volumeML() / 0.05);
    return `<b>${t.label}</b>\n${drops ? `Holds about ${drops} drops` : 'Empty'}\nClick: fill (tip in a liquid) or release one drop.`;
  }

  toolAct(t: Tool, ctx: AppContext, fine: boolean): void {
    const r = t.act(ctx.world, fine);
    if (r === 'drop') ctx.sfx.blip(900, 0.05);
    if (r === 'fill') ctx.sfx.blip(400, 0.04);
  }
}

import { newLot } from '../chem/lot';
import { GLASSWARE } from '../data/glassware';
import { Container } from '../sim/container';
import { World } from '../sim/world';
import { composition, tempReading, volumeReading } from '../ui/readings';
import type { AppContext, Mode } from './mode';

/** Free play: pour water, heat it, boil it, chill it. */
export class SandboxMode implements Mode {
  id = 'sandbox';
  title = 'Sandbox';

  enter(ctx: AppContext): void {
    ctx.world.dispose();
    const w = new World();
    ctx.world = w;
    w.equip({ id: 'shelf', kind: 'shelf', label: 'Reagent shelf', x: 4, y: 44, w: 92, h: 4 });
    w.equip({ id: 'hotplate', kind: 'hotplate', label: 'Hot plate', x: 104, y: 150, w: 48, h: 14, setpoint: 250 });
    w.equip({ id: 'bath', kind: 'bath', label: 'Water bath', x: 160, y: 120, w: 60, h: 36, levelY: 130, setpoint: 75 });
    w.equip({ id: 'ice', kind: 'bath', label: 'Ice bath', x: 228, y: 128, w: 48, h: 28, levelY: 136, temp: 1, setpoint: 1, fixedTemp: true });
    w.equip({ id: 'balance', kind: 'balance', label: 'Balance', x: 284, y: 152, w: 32, h: 12, tare: 0 });

    const water = new Container(GLASSWARE.bottle, 22, 20, 'Distilled water');
    water.tag = [80, 150, 230];
    const wl = newLot('liquid');
    wl.addGrams('water', 1000);
    water.fill(wl, 'liquid');
    w.add(water);

    const etoh = new Container(GLASSWARE.bottle, 50, 20, 'Ethanol (95 %)');
    etoh.tag = [230, 120, 60];
    const el = newLot('liquid');
    el.addGrams('ethanol', 380);
    el.addGrams('water', 20);
    etoh.fill(el, 'liquid');
    w.add(etoh);

    w.add(new Container(GLASSWARE.beaker100, 40, 120));
    w.add(new Container(GLASSWARE.erlenmeyer125, 128, 110));
    w.add(new Container(GLASSWARE.cylinder10, 84, 130));
    w.add(new Container(GLASSWARE.beaker50, 190, 100));

    ctx.structure.show('water', 'Sandbox');
    this.buildPanel(ctx);
  }

  private buildPanel(ctx: AppContext): void {
    const p = ctx.panel;
    p.innerHTML = `
      <h2>Sandbox</h2>
      <p class="hint">
        <b>Drag</b> glassware to move it. <b>Right-drag</b> (or hold it and use the wheel or <kbd>Q</kbd>/<kbd>E</kbd>) to tilt and pour.
        Let go and it rights itself. Hover anything to read it.
      </p>
      <div class="group">
        <h3>Hot plate</h3>
        <div class="row"><label for="hp-set">Setpoint</label><output id="hp-out"></output></div>
        <input id="hp-set" type="range" min="30" max="350" step="5" />
        <div class="row"><button id="hp-on">Turn on</button><span class="stat" id="hp-temp"></span></div>
      </div>
      <div class="group">
        <h3>Water bath</h3>
        <div class="row"><label for="bath-set">Setpoint</label><output id="bath-out"></output></div>
        <input id="bath-set" type="range" min="25" max="95" step="1" />
        <div class="row"><button id="bath-on">Turn on</button><span class="stat" id="bath-temp"></span></div>
      </div>
      <div class="group">
        <h3>Balance</h3>
        <div class="row"><button id="tare">Tare</button><span class="hint">zeroes the reading with what is on it</span></div>
      </div>
      <div class="group">
        <h3>Add glassware</h3>
        <div class="row" id="spawn"></div>
      </div>
      <div class="group">
        <h3>Time</h3>
        <div class="row" id="speed"></div>
      </div>
      <div class="group">
        <h3>Bench</h3>
        <div class="row"><button id="clear">Clear spills</button><button id="reset">Reset sandbox</button><button id="mute">Sound on</button></div>
        <div class="stat" id="stats"></div>
      </div>`;
    const w = () => ctx.world;
    const hp = () => w().equipmentById('hotplate')!;
    const bath = () => w().equipmentById('bath')!;
    const $ = <T extends HTMLElement>(id: string) => p.querySelector(`#${id}`) as T;

    const hpSet = $<HTMLInputElement>('hp-set');
    hpSet.value = String(hp().setpoint);
    hpSet.oninput = () => (hp().setpoint = +hpSet.value);
    $('hp-on').onclick = () => (hp().on = !hp().on);
    const bathSet = $<HTMLInputElement>('bath-set');
    bathSet.value = String(bath().setpoint);
    bathSet.oninput = () => (bath().setpoint = +bathSet.value);
    $('bath-on').onclick = () => (bath().on = !bath().on);
    $('tare').onclick = () => {
      const bal = w().equipmentById('balance')!;
      const on = w().containers.find((c) => c.restOn === 'balance');
      bal.tare = on ? on.grossMass() : 0;
    };
    const spawn = $('spawn');
    for (const id of ['beaker50', 'beaker100', 'erlenmeyer50', 'erlenmeyer125', 'cylinder10', 'cylinder25', 'testTube', 'watchGlass']) {
      const b = document.createElement('button');
      b.textContent = GLASSWARE[id].name.replace(' graduated', '');
      b.onclick = () => w().add(new Container(GLASSWARE[id], 150 + Math.random() * 40, 20));
      spawn.append(b);
    }
    const speed = $('speed');
    for (const n of [1, 4, 16]) {
      const b = document.createElement('button');
      b.textContent = n === 1 ? 'Real pace' : `${n}× faster`;
      b.dataset.speed = String(n);
      b.onclick = () => (ctx.speed = n);
      speed.append(b);
    }
    $('clear').onclick = () => w().clearSpills();
    $('reset').onclick = () => this.enter(ctx);
    const mute = $('mute');
    mute.onclick = () => {
      ctx.sfx.muted = !ctx.sfx.muted;
      mute.textContent = ctx.sfx.muted ? 'Sound off' : 'Sound on';
    };
    this.refresh(ctx);
  }

  refresh(ctx: AppContext): void {
    const p = ctx.panel;
    const hp = ctx.world.equipmentById('hotplate')!;
    const bath = ctx.world.equipmentById('bath')!;
    const set = (id: string, t: string) => {
      const el = p.querySelector(`#${id}`);
      if (el && el.textContent !== t) el.textContent = t;
    };
    set('hp-out', `${hp.setpoint} °C`);
    set('hp-on', hp.on ? 'Turn off' : 'Turn on');
    p.querySelector('#hp-on')?.classList.toggle('on', hp.on);
    set('hp-temp', `surface ${Math.round(hp.temp)} °C`);
    set('bath-out', `${bath.setpoint} °C`);
    set('bath-on', bath.on ? 'Turn off' : 'Turn on');
    p.querySelector('#bath-on')?.classList.toggle('on', bath.on);
    set('bath-temp', `water ${bath.temp.toFixed(1)} °C`);
    p.querySelectorAll<HTMLButtonElement>('#speed button').forEach((b) => b.classList.toggle('on', +b.dataset.speed! === ctx.speed));
    const l = ctx.world.losses;
    set('stats', `Spilled: ${l.spilledML.toFixed(1)} mL · Lost as vapour: ${l.vapourG.toFixed(2)} g`);
  }

  tooltip(c: Container): string {
    const comp = composition(c);
    return `<b>${c.label}</b>\nVolume: ${volumeReading(c)}\nTemp: ${tempReading(c.tempC)}${comp ? '\n' + comp : ''}`;
  }
}

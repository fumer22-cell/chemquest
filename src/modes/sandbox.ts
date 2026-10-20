import { newLot } from '../chem/lot';
import { GLASSWARE } from '../data/glassware';
import { Container } from '../sim/container';
import { Tool } from '../sim/tools';
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

    w.tools = [new Tool('pipette', 100, 20), new Tool('rod', 106, 14), new Tool('spatula', 112, 22)];
    this.buildPanel(ctx);
  }

  private buildPanel(ctx: AppContext): void {
    const p = ctx.panel;
    p.innerHTML = `
      <div class="manual">
        <div class="manual-head"><span class="kicker">Sandbox</span></div>
        <article class="page">
          <h3>Free bench</h3>
          <p>Pour, heat, boil and chill anything on the shelf. Hover glassware to see exactly what is in it.</p>
          <section class="sec"><h4>Controls</h4><ul>
            <li>Drag glassware to move it. Right-drag, or hold it and use the wheel or Q/E, to tilt and pour.</li>
            <li>The hot plate and water bath have − / + / ON buttons on the bench front; the balance has TARE.</li>
            <li>Pipette: click in a liquid to fill, click again for a drop. Spatula: click in crystals to scoop, again to tip out. Both pick up spills.</li>
          </ul></section>
        </article>
      </div>
      <div class="group"><h3>Add glassware</h3><div class="row" id="spawn"></div></div>
      <div class="group"><h3>Time</h3><div class="row" id="speed"></div></div>
      <div class="group">
        <h3>Bench</h3>
        <div class="row"><button id="clear">Clear spills</button><button id="reset">Reset sandbox</button><button id="mute">Sound on</button></div>
        <div class="stat" id="stats"></div>
      </div>`;
    const w = () => ctx.world;
    const $ = <T extends HTMLElement>(id: string) => p.querySelector(`#${id}`) as T;
    const spawn = $('spawn');
    for (const id of ['beaker50', 'beaker100', 'erlenmeyer50', 'erlenmeyer125', 'cylinder10', 'cylinder25', 'testTube', 'watchGlass']) {
      const b = document.createElement('button');
      b.textContent = GLASSWARE[id].name.replace(' graduated', '');
      b.onclick = () => w().add(new Container(GLASSWARE[id], 150 + Math.random() * 40, 60));
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
    p.querySelectorAll<HTMLButtonElement>('#speed button').forEach((b) => b.classList.toggle('on', +b.dataset.speed! === ctx.speed));
    const l = ctx.world.losses;
    const t = `Spilled: ${l.spilledML.toFixed(1)} mL · Lost as vapour: ${l.vapourG.toFixed(2)} g`;
    const el = p.querySelector('#stats');
    if (el && el.textContent !== t) el.textContent = t;
  }

  toolTooltip(t: Tool): string {
    return `<b>${t.label}</b>\n${t.kind === 'pipette' ? `Holds ${t.volumeML().toFixed(2)} mL. Click to fill or drop.` : t.kind === 'spatula' ? 'Click in crystals to scoop, click again to tip out.' : 'Drag inside a flask to stir.'}`;
  }

  tooltip(c: Container): string {
    const comp = composition(c);
    return `<b>${c.label}</b>\nVolume: ${volumeReading(c)}\nTemp: ${tempReading(c.tempC)}${comp ? '\n' + comp : ''}`;
  }
}

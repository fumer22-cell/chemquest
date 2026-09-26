import Phaser from 'phaser';
import { MINERALS } from '../data/minerals';
import { WORLD } from '../data/scenario';
import { game } from '../game/state';
import { COLORS, text } from '../ui/widgets';

interface Interactable {
  x: number;
  y: number;
  r: number;
  label: () => string;
  act: () => void;
}

const SPEED = 190;

/** The crash site: walk around, collect minerals, enter the lab or trading post. */
export class WorldScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'e', Phaser.Input.Keyboard.Key>;
  private interactables: Interactable[] = [];
  private depositLabels: { t: Phaser.GameObjects.Text; mineralId: string }[] = [];

  constructor() {
    super('World');
  }

  create(): void {
    this.registry.set('toasts', true);
    this.registry.set('prompt', '');
    this.interactables = [];
    this.depositLabels = [];
    this.physics.world.setBounds(0, 40, WORLD.width, WORLD.height - 40);

    this.drawGround();
    const solids = this.physics.add.staticGroup();
    this.drawWreck(solids);
    this.drawLab(solids);
    this.drawTradingPost(solids);
    MINERALS.forEach((m) => this.drawDeposit(m.id));

    const start = (this.registry.get('playerPos') as { x: number; y: number }) ?? WORLD.playerStart;
    this.player = this.physics.add.sprite(start.x, start.y, 'player').setScale(2).setDepth(10);
    this.player.setCollideWorldBounds(true);
    this.player.body!.setSize(14, 10).setOffset(2, 14);
    this.physics.add.collider(this.player, solids);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({
      up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', w: 'W', a: 'A', s: 'S', d: 'D', e: 'E',
    }) as typeof this.keys;
    this.keys.e.on('down', () => this.interact());

    text(this, 640, 700, 'WASD / arrows: move    E: interact    J: journal', 12, COLORS.dim).setOrigin(0.5, 0.5).setAlpha(0.7);

    if (!this.registry.get('introShown')) {
      this.registry.set('introShown', true);
      this.time.delayedCall(400, () => {
        const g = game();
        g.addLog('You survived the crash. Life support is failing: you need oxygen and water, fast.', 'warn');
        g.addLog('The lab module still works. Check the journal (J) for the singed lab manual.');
      });
    }
  }

  private drawGround(): void {
    const g = this.add.graphics();
    g.fillStyle(0x4a2f2a).fillRect(0, 34, WORLD.width, WORLD.height);
    const rnd = new Phaser.Math.RandomDataGenerator(['chemquest']);
    for (let i = 0; i < 90; i++) {
      g.fillStyle(rnd.pick([0x5b3a33, 0x3d2622, 0x6a4639]), 1);
      g.fillEllipse(rnd.between(0, WORLD.width), rnd.between(40, WORLD.height), rnd.between(20, 90), rnd.between(8, 30));
    }
    for (let i = 0; i < 400; i++) {
      this.add.image(rnd.between(0, WORLD.width), rnd.between(40, WORLD.height), 'speck').setTint(rnd.pick([0x8a6254, 0x2f1d1a, 0xa77b62])).setScale(rnd.between(1, 2));
    }
  }

  private drawWreck(solids: Phaser.Physics.Arcade.StaticGroup): void {
    const { x, y } = WORLD.wreck;
    const g = this.add.graphics();
    g.fillStyle(0x1f1512, 0.6).fillEllipse(x + 10, y + 30, 230, 70); // scorch
    g.fillStyle(0x8d96a3).fillRoundedRect(x - 90, y - 22, 170, 44, 18);
    g.fillStyle(0x6c7480).fillTriangle(x - 20, y - 20, x + 40, y - 80, x + 55, y - 20);
    g.fillStyle(0x6c7480).fillTriangle(x - 60, y + 20, x - 10, y + 70, x + 10, y + 20);
    g.fillStyle(0x3a4a5c).fillRect(x + 40, y - 12, 26, 14);
    g.fillStyle(0xff9f43).fillRect(x - 96, y - 8, 10, 16);
    text(this, x - 40, y - 8, 'ARGO-7', 12, '#2b2f36');
    const body = this.add.rectangle(x - 5, y, 170, 44).setVisible(false);
    solids.add(body);
    // Smoke puffs
    this.time.addEvent({
      delay: 450,
      loop: true,
      callback: () => {
        const puff = this.add.circle(x + 30 + Phaser.Math.Between(-10, 10), y - 20, Phaser.Math.Between(5, 9), 0x777777, 0.5);
        this.tweens.add({ targets: puff, y: y - 110, alpha: 0, scale: 2.5, duration: 2600, onComplete: () => puff.destroy() });
      },
    });
    this.interactables.push({
      x: x - 5,
      y: y + 40,
      r: 70,
      label: () => 'Wreck of the ARGO-7 (nothing useful left here)',
      act: () => game().addLog('The hull is split open. The life-support tanks are nearly empty — the lab module is your best hope.'),
    });
  }

  private drawLab(solids: Phaser.Physics.Arcade.StaticGroup): void {
    const { x, y, w, h } = WORLD.lab;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRect(x - w / 2 + 6, y - h / 2 + 8, w, h);
    g.fillStyle(0xd9dde3).fillRect(x - w / 2, y - h / 2, w, h);
    g.fillStyle(0xb7bec8).fillRect(x - w / 2, y - h / 2, w, 18);
    g.fillStyle(0x49b6ff).fillRect(x - w / 2 + 12, y - 10, 30, 18).fillRect(x + w / 2 - 42, y - 10, 30, 18);
    g.fillStyle(0x3b4252).fillRect(x - 16, y + h / 2 - 34, 32, 34);
    g.fillStyle(0x7ee081).fillRect(x + 20, y + h / 2 - 26, 6, 6);
    text(this, x, y - h / 2 + 2, 'LAB MODULE', 13, '#2b2f36').setOrigin(0.5, 0);
    const body = this.add.rectangle(x, y, w, h).setVisible(false);
    solids.add(body);
    this.interactables.push({
      x,
      y: y + h / 2 + 16,
      r: 45,
      label: () => 'Enter the lab module',
      act: () => this.goTo('Lab'),
    });
  }

  private drawTradingPost(solids: Phaser.Physics.Arcade.StaticGroup): void {
    const { x, y, w, h } = WORLD.tradingPost;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRect(x - w / 2 + 6, y - h / 2 + 8, w, h);
    g.fillStyle(0x7a5a3a).fillRect(x - w / 2, y - h / 2 + 30, w, h - 30);
    for (let i = 0; i < 8; i++) {
      g.fillStyle(i % 2 ? 0xe6c35c : 0xc0392b).fillRect(x - w / 2 + (i * w) / 8, y - h / 2 + 14, w / 8, 22);
    }
    g.fillStyle(0x3b2a1a).fillRect(x - w / 2 + 10, y + 10, w - 20, 16);
    // merchant
    g.fillStyle(0x6fcf97).fillCircle(x, y - 2, 12).fillRect(x - 10, y + 6, 20, 10);
    g.fillStyle(0x111111).fillCircle(x - 4, y - 4, 2).fillCircle(x + 4, y - 4, 2).fillCircle(x, y - 9, 2);
    text(this, x, y - h / 2 - 4, 'TRADING POST', 13, '#ffd166').setOrigin(0.5, 0);
    const body = this.add.rectangle(x, y, w, h).setVisible(false);
    solids.add(body);
    this.interactables.push({
      x,
      y: y + h / 2 + 16,
      r: 50,
      label: () => 'Talk to the merchant',
      act: () => this.goTo('TradingPost'),
    });
  }

  private drawDeposit(mineralId: string): void {
    const m = MINERALS.find((x) => x.id === mineralId)!;
    const { x, y } = m.deposit;
    const rnd = new Phaser.Math.RandomDataGenerator([m.id]);
    const g = this.add.graphics();
    const shade = Phaser.Display.Color.IntegerToColor(m.color);
    const dark = shade.clone().darken(30).color;
    const light = shade.clone().lighten(15).color;
    for (let i = 0; i < 8; i++) {
      const rx = x + rnd.between(-36, 36);
      const ry = y + rnd.between(-16, 16);
      const r = rnd.between(8, 16);
      const pts: Phaser.Math.Vector2[] = [];
      const n = rnd.between(5, 7);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rnd.realInRange(-0.3, 0.3);
        const rr = r * rnd.realInRange(0.7, 1.1);
        pts.push(new Phaser.Math.Vector2(rx + Math.cos(a) * rr, ry + Math.sin(a) * rr * 0.7));
      }
      g.fillStyle(0x000000, 0.25).fillEllipse(rx + 3, ry + r * 0.6, r * 2, r * 0.7);
      g.fillStyle(dark).fillPoints(pts, true);
      g.fillStyle(m.color).fillPoints(pts.map((p) => new Phaser.Math.Vector2(rx + (p.x - rx) * 0.8 - 1, ry + (p.y - ry) * 0.8 - 2)), true);
      g.fillStyle(light).fillCircle(rx - r * 0.3, ry - r * 0.3, Math.max(2, r * 0.18));
    }
    const label = text(this, x, y + 30, '', 12, '#f0e6d8', { backgroundColor: '#00000066', padding: { x: 4, y: 2 } }).setOrigin(0.5, 0);
    this.depositLabels.push({ t: label, mineralId });
    this.interactables.push({
      x,
      y,
      r: 60,
      label: () => `Collect ${m.gramsPerHarvest} g — ${m.look}`,
      act: () => {
        game().harvest(m);
        const flash = this.add.circle(x, y, 40, 0xffffff, 0.35);
        this.tweens.add({ targets: flash, alpha: 0, scale: 1.6, duration: 300, onComplete: () => flash.destroy() });
      },
    });
  }

  private goTo(scene: 'Lab' | 'TradingPost'): void {
    this.registry.set('playerPos', { x: this.player.x, y: this.player.y });
    this.registry.set('prompt', '');
    this.scene.start(scene);
  }

  private nearest(): Interactable | null {
    let best: Interactable | null = null;
    let bd = Infinity;
    for (const it of this.interactables) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, it.x, it.y);
      if (d < it.r && d < bd) (best = it), (bd = d);
    }
    return best;
  }

  private interact(): void {
    if (this.scene.isActive('Journal') || this.scene.isActive('End')) return;
    this.nearest()?.act();
  }

  update(): void {
    const k = this.keys;
    const frozen = this.scene.isActive('End');
    let vx = 0;
    let vy = 0;
    if (!frozen) {
      if (k.left.isDown || k.a.isDown) vx -= 1;
      if (k.right.isDown || k.d.isDown) vx += 1;
      if (k.up.isDown || k.w.isDown) vy -= 1;
      if (k.down.isDown || k.s.isDown) vy += 1;
    }
    const len = Math.hypot(vx, vy) || 1;
    this.player.setVelocity((vx / len) * SPEED, (vy / len) * SPEED);
    if (vx) this.player.setFlipX(vx < 0);

    const n = this.nearest();
    this.registry.set('prompt', n ? `[E] ${n.label()}` : '');

    const j = game().journal;
    for (const d of this.depositLabels) {
      const m = MINERALS.find((x) => x.id === d.mineralId)!;
      const known = j.samples.get(m.id)?.identified;
      d.t.setText(known ? `${m.mineralName} (${m.label})` : `${m.label}: unknown`);
    }
  }
}

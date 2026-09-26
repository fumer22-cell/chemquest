import Phaser from 'phaser';
import { getSubstance } from '../chem';
import { ORDERS, ORDER_TOLERANCE } from '../data/orders';
import { SHOP } from '../data/shop';
import { game } from '../game/state';
import { COLORS, button, panel, text } from '../ui/widgets';

/** Sell prepared solutions for credits; buy upgrades and supplies. */
export class TradingPostScene extends Phaser.Scene {
  private dyn!: Phaser.GameObjects.Container;
  private selectedOrder: string | null = null;
  private selectedBottle: string | null = null;
  private report = '';
  private reportColor = COLORS.text;
  private shopMsg = '';

  constructor() {
    super('TradingPost');
  }

  create(): void {
    this.registry.set('toasts', false);
    this.registry.set('prompt', '');
    this.selectedOrder = null;
    this.selectedBottle = null;
    this.report = '';
    this.shopMsg = '';
    this.add.rectangle(0, 34, 1280, 686, 0x1b1511).setOrigin(0);

    // Merchant
    const g = this.add.graphics();
    g.fillStyle(0x6fcf97).fillCircle(60, 90, 30).fillRect(36, 112, 48, 30);
    g.fillStyle(0x111111).fillCircle(50, 84, 4).fillCircle(70, 84, 4).fillCircle(60, 72, 4);
    text(this, 110, 56, 'Ixli, the merchant', 18, '#ffd166');
    text(
      this,
      110,
      82,
      '“Stranded? Everyone here is. I pay for good chemistry — I measure everything you bring me, so be accurate.\n' +
        ` Within ${ORDER_TOLERANCE.full * 100}% I pay in full; within ${ORDER_TOLERANCE.partial * 100}% I pay half. Otherwise, take it back.”`,
      13,
      COLORS.text,
      { wordWrap: { width: 1140 } },
    );

    panel(this, 8, 140, 420, 470, 'ORDERS');
    panel(this, 436, 140, 408, 470, 'YOUR BOTTLES');
    panel(this, 852, 140, 420, 470, 'SHOP');
    panel(this, 8, 616, 1264, 98, 'MERCHANT’S ANALYSIS');

    button(this, 1110, 50, 160, 28, '← Leave  [Esc]', { onClick: () => this.leave() });
    this.input.keyboard!.on('keydown-ESC', () => this.leave());
    this.events.once('shutdown', () => this.input.keyboard!.removeAllListeners());

    this.dyn = this.add.container(0, 0);
    this.refresh();
  }

  private leave(): void {
    if (this.scene.isActive('Journal')) return;
    this.scene.start('World');
  }

  private refresh(): void {
    this.dyn.removeAll(true);
    const g = game();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.dyn.add(o), o);

    // Orders
    ORDERS.forEach((o, i) => {
      const y = 166 + i * 146;
      const done = g.completedOrders.get(o.id);
      const sel = this.selectedOrder === o.id;
      add(this.add.rectangle(16, y, 404, 136, sel ? 0x2f3a4f : 0x241d18).setOrigin(0).setStrokeStyle(1, sel ? COLORS.accent : 0x4a3b30));
      add(text(this, 24, y + 8, o.request, 13, COLORS.text, { wordWrap: { width: 388 } }));
      add(text(this, 24, y + 76, `Pays ${o.pay} cr`, 13, '#ffd166'));
      if (done) {
        add(
          text(this, 24, y + 100, done.result === 'full' ? `✓ Delivered — paid ${done.payment} cr` : `✓ Delivered (partial) — paid ${done.payment} cr`, 13, COLORS.good),
        );
      } else {
        add(
          button(this, 300, y + 98, 110, 28, sel ? 'Selected' : 'Select', {
            onClick: () => ((this.selectedOrder = o.id), this.refresh()),
          }).setActiveState(sel),
        );
      }
    });

    // Bottles
    if (!g.products.length) {
      add(
        text(this, 448, 170, 'No bottles yet.\n\nMake a solution in the lab, then press “Bottle” on its vessel to bring it here.', 13, COLORS.dim, {
          wordWrap: { width: 380 },
        }),
      );
    }
    g.products.forEach((p, i) => {
      const y = 166 + i * 62;
      const sel = this.selectedBottle === p.id;
      add(this.add.rectangle(444, y, 392, 56, sel ? 0x2f3a4f : 0x241d18).setOrigin(0).setStrokeStyle(1, sel ? COLORS.accent : 0x4a3b30));
      add(text(this, 454, y + 8, p.name, 14));
      add(text(this, 454, y + 30, `poured from the ${p.from.toLowerCase()}`, 11, COLORS.dim));
      add(button(this, 648, y + 14, 90, 28, sel ? 'Selected' : 'Select', { onClick: () => ((this.selectedBottle = p.id), this.refresh()) }).setActiveState(sel));
      add(
        button(this, 744, y + 14, 84, 28, 'Discard', {
          fontSize: 12,
          onClick: () => {
            g.discardProduct(p.id);
            if (this.selectedBottle === p.id) this.selectedBottle = null;
            this.refresh();
          },
        }),
      );
    });
    const canDeliver = !!this.selectedOrder && !!this.selectedBottle;
    add(
      button(this, 444, 566, 392, 36, 'Deliver selected bottle for selected order', {
        onClick: () => this.deliver(),
      }).setEnabled(canDeliver),
    );

    // Shop
    SHOP.forEach((s, i) => {
      const y = 166 + i * 92;
      const owned = s.kind === 'upgrade' && g.upgrades.has(s.id);
      add(this.add.rectangle(860, y, 404, 84, 0x241d18).setOrigin(0).setStrokeStyle(1, 0x4a3b30));
      add(text(this, 870, y + 8, `${s.name}${s.kind === 'upgrade' ? '  [tool upgrade]' : ''}`, 14));
      add(text(this, 870, y + 30, s.description, 12, COLORS.dim, { wordWrap: { width: 270 } }));
      add(text(this, 870, y + 60, `${s.price} cr`, 13, '#ffd166'));
      add(
        button(this, 1160, y + 26, 94, 30, owned ? 'Owned' : 'Buy', {
          onClick: () => {
            this.shopMsg = g.buy(s.id);
            this.refresh();
          },
        }).setEnabled(!owned && g.credits >= s.price),
      );
    });
    add(text(this, 860, 540, `Your credits: ${g.credits} cr`, 15, '#ffd166'));
    if (this.shopMsg) add(text(this, 860, 566, this.shopMsg, 13, COLORS.accentText));

    add(text(this, 20, 640, this.report || 'Select an order and a bottle, then deliver.', 14, this.reportColor, { wordWrap: { width: 1240 } }));
  }

  private deliver(): void {
    const g = game();
    if (!this.selectedOrder || !this.selectedBottle) return;
    const order = ORDERS.find((o) => o.id === this.selectedOrder)!;
    const grade = g.deliver(this.selectedOrder, this.selectedBottle);
    if (!grade) return;
    const solute = getSubstance(order.soluteId).formula;
    const measured = `Measured: ${grade.measuredVolumeML.toFixed(1)} mL at ${grade.measuredMolarity.toPrecision(3)} M ${solute} (wanted ${order.volumeML} mL at ${order.molarity.toFixed(2)} M).`;
    const contam = grade.contaminants.length
      ? ` Also found: ${grade.contaminants.map((c) => (c.startsWith('undissolved') ? c : g.journal.displayName(c))).join(', ')}.`
      : '';
    if (grade.result === 'rejected') {
      this.report = `✗ “${grade.reason}” ${measured}${contam} The bottle is handed back.`;
      this.reportColor = COLORS.danger;
    } else {
      this.report = `${grade.result === 'full' ? '✓' : '≈'} “${grade.reason}” ${measured} +${grade.payment} cr.`;
      this.reportColor = grade.result === 'full' ? COLORS.good : COLORS.warn;
      g.addLog(`Sold an order to Ixli for ${grade.payment} cr.`, 'good');
      this.selectedOrder = null;
      this.selectedBottle = null;
    }
    this.refresh();
  }
}

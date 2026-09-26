import Phaser from 'phaser';
import type { GameStatus } from '../game/state';
import { newGame } from '../game/state';
import { COLORS, button, text } from '../ui/widgets';

export class EndScene extends Phaser.Scene {
  constructor() {
    super('End');
  }

  create(data: { status: GameStatus }): void {
    this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.8).setOrigin(0).setInteractive();
    const why =
      data.status === 'dead-o2'
        ? 'The oxygen ran out. Your vision narrows to a grey tunnel…'
        : 'The water ran out. Dehydration takes you in the alien heat…';
    text(this, 640, 280, 'YOU DID NOT SURVIVE', 36, COLORS.danger).setOrigin(0.5);
    text(this, 640, 340, why, 16, COLORS.text).setOrigin(0.5);
    text(this, 640, 372, 'Tip: re-read the lab manual and placards in your journal (J). Watch the gauges.', 13, COLORS.dim).setOrigin(0.5);
    button(this, 560, 420, 160, 40, 'Try again', {
      onClick: () => {
        newGame();
        this.registry.set('playerPos', undefined);
        this.registry.set('introShown', false);
        for (const k of ['Lab', 'TradingPost', 'Journal', 'World']) this.scene.stop(k);
        this.scene.stop('Hud');
        this.scene.start('World');
        this.scene.launch('Hud');
      },
    });
  }
}

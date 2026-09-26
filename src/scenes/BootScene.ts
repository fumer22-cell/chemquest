import Phaser from 'phaser';

/** Generates placeholder textures, then starts the game. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const g = this.make.graphics({}, false);

    // Player: little astronaut in a chem-lab suit.
    g.fillStyle(0xf2f2f2).fillRect(3, 6, 12, 14);
    g.fillStyle(0x49b6ff).fillRect(4, 1, 10, 7);
    g.fillStyle(0x0d2940).fillRect(6, 3, 6, 3);
    g.fillStyle(0xff9f43).fillRect(1, 8, 3, 8);
    g.fillStyle(0x6b7280).fillRect(4, 20, 4, 4).fillRect(10, 20, 4, 4);
    g.generateTexture('player', 18, 24);
    g.clear();

    // Rock chunk for deposits.
    g.fillStyle(0xffffff).fillRect(2, 4, 10, 8).fillRect(4, 2, 6, 12).fillRect(0, 6, 14, 4);
    g.generateTexture('rock', 14, 14);
    g.clear();

    // Ground speck.
    g.fillStyle(0xffffff).fillRect(0, 0, 2, 2);
    g.generateTexture('speck', 2, 2);
    g.destroy();

    this.scene.start('World');
    this.scene.launch('Hud');
  }
}

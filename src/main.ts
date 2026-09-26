import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';
import { LabScene } from './scenes/LabScene';
import { TradingPostScene } from './scenes/TradingPostScene';
import { HudScene } from './scenes/HudScene';
import { JournalScene } from './scenes/JournalScene';
import { EndScene } from './scenes/EndScene';
import { COLORS } from './ui/widgets';
import { game as gameState } from './game/state';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: COLORS.bg,
  pixelArt: true,
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, WorldScene, LabScene, TradingPostScene, HudScene, JournalScene, EndScene],
});

// Handy for debugging in the browser console.
Object.assign(window as object, { __game: game, __state: gameState });

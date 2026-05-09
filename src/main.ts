import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { diag } from './utils/diag';

diag(`phaser version: ${Phaser.VERSION}`, 'ok');

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 540,
  height: 960,
  pixelArt: true,
  backgroundColor: '#7AC74F',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, PreloadScene, GameScene, UIScene],
};

try {
  const game = new Phaser.Game(config);
  game.events.once(Phaser.Core.Events.READY, () => {
    diag(`game ready (renderer=${game.renderer.type === 1 ? 'CANVAS' : 'WEBGL'})`, 'ok');
  });
} catch (err) {
  diag(`game ctor threw: ${(err as Error).message}`, 'err');
  throw err;
}

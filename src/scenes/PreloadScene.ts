import Phaser from 'phaser';
import { TILE_COLORS, TILE_SIZE } from '../data/tiles';
import { diag } from '../utils/diag';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    diag('PreloadScene.preload: loading main_map', 'ok');
    this.load.json('main_map', 'assets/tilemaps/main.json');
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      diag(`load FAIL: key=${file.key} url=${file.url}`, 'err');
    });
    this.load.on('complete', () => {
      diag('PreloadScene loader complete', 'ok');
    });
  }

  create(): void {
    try {
      this.generateTerrainTexture();
      diag('terrain texture generated', 'ok');
    } catch (err) {
      diag(`terrain gen threw: ${(err as Error).message}`, 'err');
      throw err;
    }
    diag('PreloadScene.create -> Game + UI', 'ok');
    this.scene.start('Game');
    this.scene.launch('UI');
  }

  // Phase 1 placeholder: solid-color tiles packed horizontally into one
  // tileset texture. Replace with real Tiny Swords art (§8.2) later.
  private generateTerrainTexture(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const totalWidth = TILE_COLORS.length * TILE_SIZE;
    for (let i = 0; i < TILE_COLORS.length; i++) {
      g.fillStyle(TILE_COLORS[i], 1);
      g.fillRect(i * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
      g.lineStyle(1, 0x000000, 0.18);
      g.strokeRect(i * TILE_SIZE + 0.5, 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    }
    g.generateTexture('terrain', totalWidth, TILE_SIZE);
    g.destroy();
  }
}

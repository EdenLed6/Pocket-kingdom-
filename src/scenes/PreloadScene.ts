import Phaser from 'phaser';
import { TILE_COLORS, TILE_SIZE } from '../data/tiles';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    this.load.json('main_map', 'assets/tilemaps/main.json');
  }

  create(): void {
    this.generateTerrainTexture();
    this.generateGameTextures();
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

  // Phase 2 placeholder pixel-art: composed via Graphics.generateTexture so
  // we don't depend on external assets yet. Real Tiny Swords art slots into
  // these same texture keys later.
  private generateGameTextures(): void {
    this.makeTree();
    this.makeStump();
    this.makeRock();
    this.makeBush();
    this.makeBushBare();
    this.makeDeer();
    this.makeWorker();
    this.makeTownHall();
    this.makeSelectRing();
  }

  private makeTree(): void {
    const W = 32;
    const H = 36;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    // Trunk
    g.fillStyle(0x6b4423, 1);
    g.fillRect(13, 22, 6, 12);
    g.lineStyle(1, 0x3a2412, 1);
    g.strokeRect(13, 22, 6, 12);
    // Canopy — three overlapping bumps for a chunky leaf silhouette.
    g.fillStyle(0x2f6b1a, 1);
    g.fillCircle(16, 14, 13);
    g.fillCircle(8, 16, 8);
    g.fillCircle(24, 16, 8);
    g.lineStyle(2, 0x14380a, 1);
    g.strokeCircle(16, 14, 13);
    // Highlight blob for a hint of shading.
    g.fillStyle(0x4a8a30, 1);
    g.fillCircle(12, 10, 4);
    g.generateTexture('tree', W, H);
    g.destroy();
  }

  private makeStump(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x6b4423, 1);
    g.fillCircle(16, 22, 8);
    g.lineStyle(1, 0x3a2412, 1);
    g.strokeCircle(16, 22, 8);
    g.fillStyle(0xa07840, 1);
    g.fillCircle(16, 22, 4);
    g.generateTexture('tree-stump', 32, 36);
    g.destroy();
  }

  private makeRock(): void {
    const W = 32;
    const H = 28;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    // Base shadow blob.
    g.fillStyle(0x4a4a52, 1);
    g.fillEllipse(16, 22, 26, 8);
    // Main boulder.
    g.fillStyle(0x8a8a96, 1);
    g.fillCircle(12, 16, 9);
    g.fillCircle(20, 14, 8);
    g.fillCircle(16, 12, 7);
    g.lineStyle(1, 0x4a4a52, 1);
    g.strokeCircle(12, 16, 9);
    g.strokeCircle(20, 14, 8);
    // Highlights.
    g.fillStyle(0xb0b0bc, 1);
    g.fillCircle(10, 13, 3);
    g.fillCircle(18, 11, 2);
    g.generateTexture('rock', W, H);
    g.destroy();
  }

  private makeBush(): void {
    const W = 28;
    const H = 24;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    // Foliage clumps.
    g.fillStyle(0x2f6b1a, 1);
    g.fillCircle(8, 14, 7);
    g.fillCircle(20, 14, 7);
    g.fillCircle(14, 11, 8);
    g.lineStyle(1, 0x14380a, 1);
    g.strokeCircle(8, 14, 7);
    g.strokeCircle(20, 14, 7);
    g.strokeCircle(14, 11, 8);
    // Berries.
    g.fillStyle(0xd02838, 1);
    g.fillCircle(11, 12, 1.5);
    g.fillCircle(17, 14, 1.5);
    g.fillCircle(14, 9, 1.5);
    g.fillCircle(8, 13, 1.5);
    g.fillCircle(20, 12, 1.5);
    g.generateTexture('bush', W, H);
    g.destroy();
  }

  private makeBushBare(): void {
    const W = 28;
    const H = 24;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x4a6a3a, 1);
    g.fillCircle(8, 16, 5);
    g.fillCircle(20, 16, 5);
    g.fillCircle(14, 13, 5);
    g.lineStyle(1, 0x2a4a1a, 1);
    g.strokeCircle(8, 16, 5);
    g.strokeCircle(20, 16, 5);
    g.strokeCircle(14, 13, 5);
    g.generateTexture('bush-bare', W, H);
    g.destroy();
  }

  private makeDeer(): void {
    const W = 24;
    const H = 28;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    // Legs.
    g.fillStyle(0x5a3a18, 1);
    g.fillRect(6, 18, 2, 8);
    g.fillRect(10, 18, 2, 8);
    g.fillRect(14, 18, 2, 8);
    g.fillRect(18, 18, 2, 8);
    // Body.
    g.fillStyle(0xa07040, 1);
    g.fillRect(4, 12, 16, 8);
    g.lineStyle(1, 0x5a3a18, 1);
    g.strokeRect(4, 12, 16, 8);
    // Head.
    g.fillStyle(0xa07040, 1);
    g.fillRect(16, 6, 6, 8);
    g.strokeRect(16, 6, 6, 8);
    // Antlers.
    g.lineStyle(1, 0x4a2a08, 1);
    g.lineBetween(18, 6, 16, 1);
    g.lineBetween(20, 6, 22, 1);
    g.lineBetween(16, 1, 14, 0);
    g.lineBetween(22, 1, 23, 0);
    // White spots.
    g.fillStyle(0xf0e0c0, 1);
    g.fillRect(8, 14, 1, 1);
    g.fillRect(12, 15, 1, 1);
    g.fillRect(15, 14, 1, 1);
    g.generateTexture('deer', W, H);
    g.destroy();
  }

  private makeWorker(): void {
    const W = 16;
    const H = 22;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    // Legs (brown trousers)
    g.fillStyle(0x3a2a1a, 1);
    g.fillRect(5, 15, 2, 5);
    g.fillRect(9, 15, 2, 5);
    // Body (blue tunic)
    g.fillStyle(0x3870c0, 1);
    g.fillRect(4, 8, 8, 8);
    g.lineStyle(1, 0x1f3f70, 1);
    g.strokeRect(4, 8, 8, 8);
    // Head (skin tone)
    g.fillStyle(0xf0c890, 1);
    g.fillCircle(8, 5, 4);
    g.lineStyle(1, 0x6b4423, 1);
    g.strokeCircle(8, 5, 4);
    // Hair tuft
    g.fillStyle(0x6b4423, 1);
    g.fillRect(5, 1, 6, 3);
    g.generateTexture('worker', W, H);
    g.destroy();
  }

  private makeTownHall(): void {
    // 96×96 = 3 tiles square.
    const W = 96;
    const H = 96;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    // Walls (cobble-tinted)
    g.fillStyle(0xc8b888, 1);
    g.fillRect(8, 36, 80, 56);
    g.lineStyle(2, 0x6c5328, 1);
    g.strokeRect(8, 36, 80, 56);
    // Foundation band
    g.fillStyle(0x8a7a52, 1);
    g.fillRect(8, 84, 80, 8);
    // Roof
    g.fillStyle(0xc94c2a, 1);
    g.fillTriangle(0, 40, 96, 40, 48, 4);
    g.lineStyle(2, 0x5c1f0e, 1);
    g.strokeTriangle(0, 40, 96, 40, 48, 4);
    // Roof shadow stripe
    g.fillStyle(0xa03a1f, 1);
    g.fillTriangle(0, 40, 24, 40, 12, 22);
    // Door
    g.fillStyle(0x4a2a10, 1);
    g.fillRect(40, 64, 16, 28);
    g.lineStyle(1, 0x2a1808, 1);
    g.strokeRect(40, 64, 16, 28);
    // Door knob
    g.fillStyle(0xffd040, 1);
    g.fillCircle(52, 78, 1);
    // Windows
    g.fillStyle(0xfff0a0, 1);
    g.fillRect(18, 48, 12, 12);
    g.fillRect(66, 48, 12, 12);
    g.lineStyle(1, 0x6c5328, 1);
    g.strokeRect(18, 48, 12, 12);
    g.strokeRect(66, 48, 12, 12);
    // Window crosses
    g.lineBetween(24, 48, 24, 60);
    g.lineBetween(18, 54, 30, 54);
    g.lineBetween(72, 48, 72, 60);
    g.lineBetween(66, 54, 78, 54);
    // Banner pole on the roof apex (just for charm).
    g.fillStyle(0x3a2a1a, 1);
    g.fillRect(47, 0, 2, 8);
    g.fillStyle(0xffd040, 1);
    g.fillTriangle(49, 1, 56, 4, 49, 7);
    g.generateTexture('town-hall', W, H);
    g.destroy();
  }

  private makeSelectRing(): void {
    const D = 28;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(2, 0xffff66, 1);
    g.strokeCircle(D / 2, D / 2, D / 2 - 2);
    g.generateTexture('select-ring', D, D);
    g.destroy();
  }
}

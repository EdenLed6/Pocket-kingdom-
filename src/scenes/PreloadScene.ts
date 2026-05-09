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
    this.makeBuildings();
    this.makeBuildIcon();
    this.makeUnits();
  }

  private makeUnits(): void {
    // Tunic colour + accessory differentiates each soldier silhouette at
    // 18×26. Bandits are mirrored darker so they read as hostile.
    this.makeHumanoid('u_spearman', 0xc94c2a, 0x6b4423, 'spear', false);
    this.makeHumanoid('u_archer', 0x3a8a3a, 0x6b4423, 'bow', false);
    this.makeHumanoid('u_knight', 0x90a0c0, 0x444454, 'sword', false);
    this.makeHumanoid('u_bandit_grunt', 0x4a3a3a, 0x222222, 'club', true);
    this.makeHumanoid('u_bandit_archer', 0x3a3a4a, 0x222222, 'bow', true);
    this.makeHumanoid('u_bandit_raider', 0x2a2a2a, 0x000000, 'sword', true);
  }

  private makeHumanoid(
    key: string,
    tunicColor: number,
    pantsColor: number,
    weapon: 'spear' | 'bow' | 'sword' | 'club',
    isBandit: boolean,
  ): void {
    const W = 20;
    const H = 28;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    // Legs.
    g.fillStyle(pantsColor, 1);
    g.fillRect(7, 20, 2, 6);
    g.fillRect(11, 20, 2, 6);
    // Body.
    g.fillStyle(tunicColor, 1);
    g.fillRect(6, 12, 8, 9);
    g.lineStyle(1, 0x222222, 1);
    g.strokeRect(6, 12, 8, 9);
    // Head.
    g.fillStyle(0xf0c890, 1);
    g.fillCircle(10, 8, 4);
    g.lineStyle(1, 0x6b4423, 1);
    g.strokeCircle(10, 8, 4);
    // Hair / hat tuft.
    g.fillStyle(isBandit ? 0x111111 : 0x6b4423, 1);
    g.fillRect(7, 4, 6, 3);

    if (weapon === 'spear') {
      g.lineStyle(2, 0x6b4423, 1);
      g.lineBetween(16, 24, 16, 2);
      g.fillStyle(0xc8c8d0, 1);
      g.fillTriangle(14, 4, 18, 4, 16, 0);
    } else if (weapon === 'bow') {
      g.lineStyle(2, 0x6b4423, 1);
      g.beginPath();
      g.arc(3, 14, 6, -Math.PI / 2, Math.PI / 2, false);
      g.strokePath();
      g.lineStyle(1, 0xeee0c0, 1);
      g.lineBetween(3, 8, 3, 20);
    } else if (weapon === 'sword') {
      g.lineStyle(2, 0xc8c8d0, 1);
      g.lineBetween(17, 20, 17, 6);
      g.lineStyle(2, 0x6b4423, 1);
      g.lineBetween(15, 20, 19, 20);
    } else if (weapon === 'club') {
      g.lineStyle(3, 0x4a3a18, 1);
      g.lineBetween(16, 22, 16, 8);
      g.fillStyle(0x4a3a18, 1);
      g.fillCircle(16, 8, 3);
    }

    g.generateTexture(key, W, H);
    g.destroy();
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

  private makeBuildings(): void {
    this.makeHouse();
    this.makeLumberMill();
    this.makeQuarry();
    this.makeFarm();
    this.makeHuntersLodge();
    this.makeBarracks();
    this.makeWall();
    this.makeTower();
    this.makeWarehouse();
  }

  private wallsAndRoof(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    wallColor: number,
    roofColor: number,
    roofShadow: number,
  ): void {
    const wallH = Math.floor(h * 0.55);
    g.fillStyle(wallColor, 1);
    g.fillRect(x, y + h - wallH, w, wallH);
    g.lineStyle(2, 0x6c5328, 1);
    g.strokeRect(x, y + h - wallH, w, wallH);
    // Roof: triangle apex over the centre.
    g.fillStyle(roofColor, 1);
    g.fillTriangle(x, y + h - wallH + 2, x + w, y + h - wallH + 2, x + w / 2, y);
    g.lineStyle(2, roofShadow, 1);
    g.strokeTriangle(x, y + h - wallH + 2, x + w, y + h - wallH + 2, x + w / 2, y);
    // Roof shadow side.
    g.fillStyle(roofShadow, 1);
    g.fillTriangle(x, y + h - wallH + 2, x + w * 0.25, y + h - wallH + 2, x + w * 0.125, y + h * 0.5);
  }

  private makeHouse(): void {
    const W = 64;
    const H = 64;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    this.wallsAndRoof(g, 4, 8, 56, 52, 0xd0b884, 0x9c5436, 0x5c1f0e);
    // Door.
    g.fillStyle(0x4a2a10, 1);
    g.fillRect(28, 42, 10, 18);
    g.lineStyle(1, 0x2a1808, 1);
    g.strokeRect(28, 42, 10, 18);
    // Window.
    g.fillStyle(0xfff0a0, 1);
    g.fillRect(12, 36, 8, 8);
    g.strokeRect(12, 36, 8, 8);
    g.fillRect(44, 36, 8, 8);
    g.strokeRect(44, 36, 8, 8);
    g.generateTexture('b_house', W, H);
    g.destroy();
  }

  private makeLumberMill(): void {
    const W = 64;
    const H = 64;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    this.wallsAndRoof(g, 4, 8, 56, 52, 0xb89066, 0x6f3f1f, 0x4a2410);
    // Saw blade circle.
    g.fillStyle(0xc8c8d0, 1);
    g.fillCircle(48, 48, 8);
    g.lineStyle(1, 0x404048, 1);
    g.strokeCircle(48, 48, 8);
    // Log pile in front.
    g.fillStyle(0x6b4423, 1);
    g.fillRect(10, 50, 22, 6);
    g.fillRect(10, 56, 22, 6);
    g.lineStyle(1, 0x3a2412, 1);
    g.strokeRect(10, 50, 22, 6);
    g.strokeRect(10, 56, 22, 6);
    g.generateTexture('b_lumber_mill', W, H);
    g.destroy();
  }

  private makeQuarry(): void {
    const W = 64;
    const H = 64;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    // Stone pile base.
    g.fillStyle(0x8a8a96, 1);
    g.fillRect(4, 30, 56, 30);
    g.lineStyle(2, 0x4a4a52, 1);
    g.strokeRect(4, 30, 56, 30);
    // Boulders.
    g.fillStyle(0x8a8a96, 1);
    g.fillCircle(18, 28, 8);
    g.fillCircle(40, 26, 9);
    g.fillCircle(50, 30, 6);
    g.lineStyle(1, 0x4a4a52, 1);
    g.strokeCircle(18, 28, 8);
    g.strokeCircle(40, 26, 9);
    g.strokeCircle(50, 30, 6);
    // Wooden crane / pickaxe.
    g.fillStyle(0x6b4423, 1);
    g.fillRect(8, 8, 4, 26);
    g.fillRect(8, 8, 26, 3);
    g.lineStyle(1, 0x3a2412, 1);
    g.strokeRect(8, 8, 4, 26);
    g.strokeRect(8, 8, 26, 3);
    g.generateTexture('b_quarry', W, H);
    g.destroy();
  }

  private makeFarm(): void {
    const W = 64;
    const H = 64;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    // Tilled-soil base.
    g.fillStyle(0x6b4423, 1);
    g.fillRect(4, 16, 56, 44);
    g.lineStyle(2, 0x3a2412, 1);
    g.strokeRect(4, 16, 56, 44);
    // Crop rows.
    g.fillStyle(0xc8a040, 1);
    for (let r = 22; r < 60; r += 10) {
      g.fillRect(8, r, 48, 4);
    }
    g.fillStyle(0x90c040, 1);
    for (let r = 24; r < 60; r += 10) {
      for (let c = 10; c < 56; c += 6) {
        g.fillRect(c, r - 2, 2, 2);
      }
    }
    // Scarecrow.
    g.fillStyle(0x6b4423, 1);
    g.fillRect(31, 4, 2, 14);
    g.fillRect(26, 8, 12, 2);
    g.fillStyle(0xf0c890, 1);
    g.fillCircle(32, 6, 3);
    g.generateTexture('b_farm', W, H);
    g.destroy();
  }

  private makeHuntersLodge(): void {
    const W = 64;
    const H = 64;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    this.wallsAndRoof(g, 4, 10, 56, 50, 0x6f4f2a, 0x3a5a2a, 0x1f3a14);
    // Antler trophy on the wall.
    g.lineStyle(2, 0xe0d0a0, 1);
    g.lineBetween(28, 42, 22, 36);
    g.lineBetween(36, 42, 42, 36);
    g.lineBetween(22, 36, 18, 32);
    g.lineBetween(22, 36, 24, 32);
    g.lineBetween(42, 36, 46, 32);
    g.lineBetween(42, 36, 40, 32);
    // Door.
    g.fillStyle(0x4a2a10, 1);
    g.fillRect(28, 48, 10, 12);
    g.lineStyle(1, 0x2a1808, 1);
    g.strokeRect(28, 48, 10, 12);
    g.generateTexture('b_hunters_lodge', W, H);
    g.destroy();
  }

  private makeBarracks(): void {
    const W = 96;
    const H = 96;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    // Stone fortress walls.
    g.fillStyle(0x8a8a96, 1);
    g.fillRect(8, 24, 80, 64);
    g.lineStyle(2, 0x4a4a52, 1);
    g.strokeRect(8, 24, 80, 64);
    // Crenellation along the top.
    g.fillStyle(0x8a8a96, 1);
    for (let i = 0; i < 8; i++) {
      const x = 8 + i * 10;
      g.fillRect(x, 18, 6, 6);
      g.strokeRect(x, 18, 6, 6);
    }
    // Big iron-banded gate.
    g.fillStyle(0x4a2a10, 1);
    g.fillRect(40, 56, 16, 32);
    g.lineStyle(2, 0xe0c060, 1);
    g.lineBetween(40, 64, 56, 64);
    g.lineBetween(40, 76, 56, 76);
    // Flag pole + red banner.
    g.fillStyle(0x3a2a1a, 1);
    g.fillRect(47, 0, 2, 18);
    g.fillStyle(0xc94c2a, 1);
    g.fillTriangle(49, 2, 60, 6, 49, 10);
    g.generateTexture('b_barracks', W, H);
    g.destroy();
  }

  private makeWall(): void {
    const W = 32;
    const H = 32;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x8a8a96, 1);
    g.fillRect(2, 4, 28, 26);
    g.lineStyle(2, 0x4a4a52, 1);
    g.strokeRect(2, 4, 28, 26);
    // Brick lines.
    g.lineStyle(1, 0x4a4a52, 0.7);
    g.lineBetween(2, 12, 30, 12);
    g.lineBetween(2, 20, 30, 20);
    g.lineBetween(16, 4, 16, 12);
    g.lineBetween(8, 12, 8, 20);
    g.lineBetween(24, 12, 24, 20);
    g.lineBetween(16, 20, 16, 30);
    g.generateTexture('b_wall', W, H);
    g.destroy();
  }

  private makeTower(): void {
    const W = 64;
    const H = 80;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    // Tall stone tower.
    g.fillStyle(0x8a8a96, 1);
    g.fillRect(16, 18, 32, 56);
    g.lineStyle(2, 0x4a4a52, 1);
    g.strokeRect(16, 18, 32, 56);
    // Conical roof.
    g.fillStyle(0xc94c2a, 1);
    g.fillTriangle(12, 22, 52, 22, 32, 0);
    g.lineStyle(2, 0x5c1f0e, 1);
    g.strokeTriangle(12, 22, 52, 22, 32, 0);
    // Window slits.
    g.fillStyle(0x000000, 1);
    g.fillRect(28, 32, 4, 8);
    g.fillRect(28, 50, 4, 8);
    g.generateTexture('b_tower', W, H);
    g.destroy();
  }

  private makeWarehouse(): void {
    const W = 64;
    const H = 64;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    // Wooden box building.
    g.fillStyle(0x8a6c40, 1);
    g.fillRect(4, 16, 56, 44);
    g.lineStyle(2, 0x4a3818, 1);
    g.strokeRect(4, 16, 56, 44);
    // Plank lines.
    g.lineStyle(1, 0x4a3818, 0.7);
    g.lineBetween(4, 28, 60, 28);
    g.lineBetween(4, 40, 60, 40);
    g.lineBetween(4, 52, 60, 52);
    // Roof slab.
    g.fillStyle(0x6f3f1f, 1);
    g.fillRect(2, 10, 60, 8);
    g.lineStyle(2, 0x4a2410, 1);
    g.strokeRect(2, 10, 60, 8);
    // Crates in front.
    g.fillStyle(0xc89058, 1);
    g.fillRect(10, 50, 12, 10);
    g.fillRect(42, 48, 12, 12);
    g.lineStyle(1, 0x6b4423, 1);
    g.strokeRect(10, 50, 12, 10);
    g.strokeRect(42, 48, 12, 12);
    // Door.
    g.fillStyle(0x4a2a10, 1);
    g.fillRect(28, 38, 10, 22);
    g.strokeRect(28, 38, 10, 22);
    g.generateTexture('b_warehouse', W, H);
    g.destroy();
  }

  private makeBuildIcon(): void {
    // 64×64 hammer-and-house icon for the bottom-right BUILD button.
    const W = 64;
    const H = 64;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x000000, 0.6);
    g.fillCircle(W / 2, H / 2, 26);
    g.lineStyle(2, 0xffffff, 0.9);
    g.strokeCircle(W / 2, H / 2, 26);
    // Tiny house silhouette.
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(20, 32, 44, 32, 32, 18);
    g.fillRect(22, 32, 20, 18);
    g.fillStyle(0x000000, 0.6);
    g.fillRect(30, 38, 4, 12);
    g.generateTexture('build_button', W, H);
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

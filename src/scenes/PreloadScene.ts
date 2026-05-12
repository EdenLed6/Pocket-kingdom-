import Phaser from 'phaser';
import { TILE_COLORS, TILE_SIZE } from '../data/tiles';

// Tiny Swords frames are 192×192 for most humans, 320×320 for Lancer,
// 192×256 for trees, 128×128 for bushes / sheep. We load them as
// spritesheets (frame 0 used until we wire animations).
const HUMAN_FRAME = { frameWidth: 192, frameHeight: 192 };
const LANCER_FRAME = { frameWidth: 320, frameHeight: 320 };
const TREE_FRAME = { frameWidth: 192, frameHeight: 256 };
const SQUARE_128 = { frameWidth: 128, frameHeight: 128 };

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    this.load.json('main_map', 'assets/tilemaps/main.json');

    // ----- Buildings (Tiny Swords, Blue palette = player) -----
    this.load.image('b_town_hall', 'assets/sprites/ts/buildings/blue/castle.png');
    this.load.image('b_house', 'assets/sprites/ts/buildings/blue/house1.png');
    this.load.image('b_lumber_mill', 'assets/sprites/ts/buildings/blue/house2.png');
    this.load.image('b_quarry', 'assets/sprites/ts/buildings/blue/house3.png');
    this.load.image('b_farm', 'assets/sprites/ts/buildings/blue/monastery.png');
    this.load.image('b_hunters_lodge', 'assets/sprites/ts/buildings/blue/archery.png');
    this.load.image('b_barracks', 'assets/sprites/ts/buildings/blue/barracks.png');
    this.load.image('b_tower', 'assets/sprites/ts/buildings/blue/tower.png');
    // Warehouse: Red palette so it visually reads as a separate kind.
    this.load.image('b_warehouse', 'assets/sprites/ts/buildings/red/house2.png');

    // ----- Units -----
    // Pawn (worker) — idle + run + 4 interact variants for state-driven anims.
    this.load.spritesheet('worker', 'assets/sprites/ts/units/blue/pawn_idle.png', HUMAN_FRAME);
    this.load.spritesheet('worker_run', 'assets/sprites/ts/units/blue/pawn_run.png', HUMAN_FRAME);
    this.load.spritesheet('worker_chop', 'assets/sprites/ts/units/blue/pawn_chop.png', HUMAN_FRAME);
    this.load.spritesheet('worker_mine', 'assets/sprites/ts/units/blue/pawn_mine.png', HUMAN_FRAME);
    this.load.spritesheet('worker_build', 'assets/sprites/ts/units/blue/pawn_build.png', HUMAN_FRAME);
    this.load.spritesheet('worker_knife', 'assets/sprites/ts/units/blue/pawn_knife.png', HUMAN_FRAME);
    // Soldier idles (anims for soldiers come later).
    this.load.spritesheet('u_spearman', 'assets/sprites/ts/units/blue/lancer_idle.png', LANCER_FRAME);
    this.load.spritesheet('u_archer', 'assets/sprites/ts/units/blue/archer_idle.png', HUMAN_FRAME);
    this.load.spritesheet('u_knight', 'assets/sprites/ts/units/blue/warrior_idle.png', HUMAN_FRAME);
    this.load.spritesheet('u_bandit_grunt', 'assets/sprites/ts/units/black/warrior_idle.png', HUMAN_FRAME);
    this.load.spritesheet('u_bandit_archer', 'assets/sprites/ts/units/black/archer_idle.png', HUMAN_FRAME);
    this.load.spritesheet('u_bandit_raider', 'assets/sprites/ts/units/black/lancer_idle.png', LANCER_FRAME);

    // ----- Resources -----
    // Four tree variants (random per spawn) for AoM-style forest texture.
    for (let n = 1; n <= 4; n++) {
      this.load.spritesheet(`tree_v${n}`, `assets/sprites/ts/resources/tree${n}.png`, TREE_FRAME);
      this.load.image(`stump_v${n}`, `assets/sprites/ts/resources/stump${n}.png`);
    }
    // Three actual grey-rock variants for stone clusters. (Earlier I
    // also loaded Tiny Swords' "Gold Stones" as smaller-rock filler;
    // those read as gold ore, not stone, so they're gone.)
    this.load.image('rock_v1', 'assets/sprites/ts/resources/rock1.png');
    this.load.image('rock_v2', 'assets/sprites/ts/resources/rock2.png');
    this.load.image('rock_v3', 'assets/sprites/ts/resources/rock3.png');
    // Berry bush from craftpix.net free top-down trees pack (Fruit_tree3 —
    // a 64×64 round bush with red fruits, no trunk). Eden uploaded it as
    // a replacement for the procedural berry overlay we abandoned.
    this.load.image('bush', 'assets/sprites/ts/resources/berry_bush.png');
    this.load.spritesheet('deer', 'assets/sprites/ts/resources/sheep_idle.png', SQUARE_128);
    // Shore decorations to soften the staircase look at lake edges.
    for (let n = 1; n <= 4; n++) {
      const key = `water_rock_${n}`;
      const file = `assets/sprites/ts/resources/water_rock_0${n}.png`;
      this.load.spritesheet(key, file, { frameWidth: 64, frameHeight: 64 });
    }
  }

  create(): void {
    this.generateTerrainTexture();
    this.generateUniquePixelArtSet();
    this.generateProceduralUiTextures();
    this.registerAnimations();
    this.scene.start('Game');
    this.scene.launch('UI');
  }

  // Phaser animations for worker states. Worker.ts plays them by name.
  private registerAnimations(): void {
    const anim = (key: string, sheet: string, frames: number, frameRate: number, repeat = -1) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(sheet, { start: 0, end: frames - 1 }),
        frameRate,
        repeat,
      });
    };
    anim('worker_idle', 'worker', 8, 8);
    anim('worker_run', 'worker_run', 6, 10);
    anim('worker_chop', 'worker_chop', 6, 10);
    anim('worker_mine', 'worker_mine', 6, 10);
    anim('worker_build', 'worker_build', 3, 8);
    anim('worker_knife', 'worker_knife', 4, 10);
    // Soldier idles — gentle bob.
    anim('spearman_idle', 'u_spearman', 12, 8);
    anim('archer_idle', 'u_archer', 6, 8);
    anim('knight_idle', 'u_knight', 8, 8);
    anim('bandit_grunt_idle', 'u_bandit_grunt', 8, 8);
    anim('bandit_archer_idle', 'u_bandit_archer', 6, 8);
    anim('bandit_raider_idle', 'u_bandit_raider', 12, 8);
  }

  // Tilemap remains procedural for now (Tiny Swords' Tilemap_color1 has
  // auto-tile transitions we'd need to author separately). Real terrain
  // art is an open Phase 4+ polish item.
  private generateTerrainTexture(): void {
    const T = TILE_SIZE;
    const totalWidth = TILE_COLORS.length * T;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    const rng = Phaser.Math.RND;
    rng.sow(['terrain']);

    for (let i = 0; i < TILE_COLORS.length; i++) {
      const x0 = i * T;
      g.fillStyle(TILE_COLORS[i], 1);
      g.fillRect(x0, 0, T, T);

      // Add per-tile noise so the canvas reads as textured.
      switch (i) {
        case 0: // grass
          g.fillStyle(0x6ab040, 1);
          for (let n = 0; n < 18; n++) {
            const px = x0 + rng.between(2, T - 3);
            const py = rng.between(2, T - 3);
            g.fillRect(px, py, 1, 2);
          }
          g.fillStyle(0x90d870, 1);
          for (let n = 0; n < 10; n++) {
            const px = x0 + rng.between(2, T - 3);
            const py = rng.between(2, T - 3);
            g.fillRect(px, py, 1, 1);
          }
          break;
        case 1: // dirt path
          g.fillStyle(0x8a6a44, 1);
          for (let n = 0; n < 16; n++) {
            const px = x0 + rng.between(2, T - 3);
            const py = rng.between(2, T - 3);
            g.fillRect(px, py, 2, 1);
          }
          g.fillStyle(0xb59872, 1);
          for (let n = 0; n < 8; n++) {
            const px = x0 + rng.between(2, T - 3);
            const py = rng.between(2, T - 3);
            g.fillRect(px, py, 1, 1);
          }
          break;
        case 2: // forest_floor (legacy, no longer used in map JSON)
          g.fillStyle(0x3d6e26, 1);
          for (let n = 0; n < 14; n++) {
            const px = x0 + rng.between(2, T - 3);
            const py = rng.between(2, T - 3);
            g.fillRect(px, py, 2, 2);
          }
          break;
        case 3: // water — wave stripes
          g.fillStyle(0x4a93cc, 1);
          for (let py = 4; py < T; py += 6) {
            const len = rng.between(20, 36);
            const offset = rng.between(2, T - len - 2);
            g.fillRect(x0 + offset, py, len, 1);
          }
          g.fillStyle(0x86c2eb, 1);
          for (let py = 6; py < T; py += 6) {
            const len = rng.between(12, 24);
            const offset = rng.between(2, T - len - 2);
            g.fillRect(x0 + offset, py, len, 1);
          }
          break;
        case 4: // stone ground
          g.fillStyle(0x6c6c75, 1);
          for (let n = 0; n < 10; n++) {
            const px = x0 + rng.between(2, T - 5);
            const py = rng.between(2, T - 5);
            g.fillRect(px, py, 3, 2);
          }
          g.fillStyle(0xa8a8b4, 1);
          for (let n = 0; n < 12; n++) {
            const px = x0 + rng.between(2, T - 3);
            const py = rng.between(2, T - 3);
            g.fillRect(px, py, 1, 1);
          }
          break;
        case 5: // bridge — wooden planks
          g.fillStyle(0x573e25, 1);
          for (let py = 6; py < T; py += 8) {
            g.fillRect(x0 + 1, py, T - 2, 1);
          }
          g.fillStyle(0x8e6c47, 1);
          for (let py = 3; py < T; py += 8) {
            g.fillRect(x0 + 1, py, T - 2, 1);
          }
          break;
      }
      // No tile-edge stroke: the grid lines made the world look segmented.
      // Adjacent tiles of the same type now blend into one continuous surface.
    }
    g.generateTexture('terrain', totalWidth, T);
    g.destroy();
  }


  private generateUniquePixelArtSet(): void {
    const mk = (key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): void => {
      if (this.textures.exists(key)) this.textures.remove(key);
      const tex = this.textures.createCanvas(key, w, h);
      if (!tex) return;
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = false;
      draw(ctx);
      tex.refresh();
    };
    const rect = (ctx: CanvasRenderingContext2D, x:number,y:number,w:number,h:number,c:string): void => { ctx.fillStyle = c; ctx.fillRect(x,y,w,h); };

    const building = (key:string, base:string, roof:string): void => mk(key,192,192,(ctx)=>{
      rect(ctx,34,92,124,76,base);
      ctx.fillStyle=roof; ctx.beginPath(); ctx.moveTo(24,92); ctx.lineTo(96,38); ctx.lineTo(168,92); ctx.fill();
      rect(ctx,84,120,26,48,'#5c3f2d'); rect(ctx,50,112,18,16,'#b7d8ef'); rect(ctx,124,112,18,16,'#b7d8ef');
    });

    const tree = (key:string, leaf:string): void => mk(key,192,256,(ctx)=>{
      rect(ctx,90,162,12,70,'#6c4c2e');
      ctx.fillStyle=leaf; ctx.beginPath(); ctx.arc(96,140,54,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(96,102,38,0,Math.PI*2); ctx.fill();
    });

    const rock=(key:string,c:string)=>mk(key,64,64,(ctx)=>{ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(10,44);ctx.lineTo(18,22);ctx.lineTo(34,14);ctx.lineTo(50,22);ctx.lineTo(56,40);ctx.lineTo(42,54);ctx.lineTo(20,52);ctx.fill();});

    // Buildings
    building('b_town_hall','#7f899a','#5e76b5'); building('b_house','#a68562','#b45f4d');
    building('b_lumber_mill','#9f7e58','#8f5b36'); building('b_quarry','#8f96a3','#666f7f');
    building('b_farm','#acacb2','#737ca4'); building('b_hunters_lodge','#9f815e','#7e523a');
    building('b_barracks','#818999','#86534d');
    mk('b_tower',192,192,(ctx)=>{rect(ctx,70,52,52,116,'#8d95a3');rect(ctx,62,38,68,20,'#666d79');});
    building('b_warehouse','#9b7b63','#a84f49');

    // Resources
    tree('tree_v1','#3f8f47'); tree('tree_v2','#367f3f'); tree('tree_v3','#4d9a54'); tree('tree_v4','#63aa64');
    for (let i=1;i<=4;i++) mk(`stump_v${i}`,64,64,(ctx)=>{ctx.fillStyle='#8e633f';ctx.beginPath();ctx.ellipse(32,36,20,12,0,0,Math.PI*2);ctx.fill();rect(ctx,16,18,32,18,'#7c5433');});
    rock('rock_v1','#7f8997'); rock('rock_v2','#6f7d8a'); rock('rock_v3','#96a1b0');
    mk('bush',64,64,(ctx)=>{ctx.fillStyle='#4f9e58';ctx.beginPath();ctx.arc(32,36,24,0,Math.PI*2);ctx.fill();rect(ctx,20,34,3,3,'#b82f43');rect(ctx,31,29,3,3,'#b82f43');rect(ctx,41,39,3,3,'#b82f43');});
  }
  private generateProceduralUiTextures(): void {
    this.makeSelectRing();
    this.makeWall();
    this.makeBuildIcon();
    this.makeRoadIcon();
    this.makeStumpFallback();
    this.makeBushBare();
    // makeBushBerries removed: the procedural overlay didn't read as
    // fruit and Eden asked to drop it. Plain Tiny Swords Bushe2 stands.
  }

  // Tiny Swords bushes are berry-less greens; we paint a chunky berry
  // overlay (much more prominent than before — Eden's previous version
  // was nearly invisible at 70 px scale). 14 berries with a clear
  // pixel-art look: dark red rim, bright body, white highlight.
  private makeSelectRing(): void {
    const D = 56; // larger to match TILE_SIZE = 64 world
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(3, 0xffff66, 1);
    g.strokeCircle(D / 2, D / 2, D / 2 - 3);
    g.generateTexture('select-ring', D, D);
    g.destroy();
  }

  private makeWall(): void {
    const T = TILE_SIZE;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x8a8a96, 1);
    g.fillRect(4, 8, T - 8, T - 16);
    g.lineStyle(2, 0x4a4a52, 1);
    g.strokeRect(4, 8, T - 8, T - 16);
    g.lineStyle(1, 0x4a4a52, 0.7);
    g.lineBetween(4, T / 3, T - 4, T / 3);
    g.lineBetween(4, (T * 2) / 3, T - 4, (T * 2) / 3);
    g.generateTexture('b_wall', T, T);
    g.destroy();
  }

  private makeBuildIcon(): void {
    const W = 64;
    const H = 64;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x000000, 0.6);
    g.fillCircle(W / 2, H / 2, 26);
    g.lineStyle(2, 0xffffff, 0.9);
    g.strokeCircle(W / 2, H / 2, 26);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(20, 32, 44, 32, 32, 18);
    g.fillRect(22, 32, 20, 18);
    g.fillStyle(0x000000, 0.6);
    g.fillRect(30, 38, 4, 12);
    g.generateTexture('build_button', W, H);
    g.destroy();
  }

  private makeRoadIcon(): void {
    const W = 64;
    const H = 64;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x000000, 0.6);
    g.fillCircle(W / 2, H / 2, 26);
    g.lineStyle(2, 0xffffff, 0.9);
    g.strokeCircle(W / 2, H / 2, 26);
    g.fillStyle(0xa07040, 1);
    g.fillRect(20, 28, 24, 8);
    g.fillStyle(0xffffff, 0.85);
    g.fillRect(26, 30, 2, 2);
    g.fillRect(36, 32, 2, 2);
    g.generateTexture('road_button', W, H);
    g.destroy();
  }

  // Backwards-compat aliases. The old code used a single 'tree-stump' key;
  // new code picks variant-specific keys. Kept so legacy paths don't 404.
  private makeStumpFallback(): void {
    // Just a 1-pixel transparent texture. Real stumps come from stump_v1..4.
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x000000, 0);
    g.fillRect(0, 0, 1, 1);
    g.generateTexture('tree-stump', 1, 1);
    g.destroy();
  }

  private makeBushBare(): void {
    // No bare-bush asset in Tiny Swords; small green nub stands in.
    const W = 32;
    const H = 24;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x4a6a3a, 1);
    g.fillCircle(W / 2, H - 6, 6);
    g.lineStyle(1, 0x2a4a1a, 1);
    g.strokeCircle(W / 2, H - 6, 6);
    g.generateTexture('bush-bare', W, H);
    g.destroy();
  }
}

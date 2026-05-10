import Phaser from 'phaser';
import { TILE_SIZE } from '../data/tiles';
import { BUILDING_DEFS, type BuildingDef, type BuildingId } from '../data/buildings';

let nextId = 0;

export class Building {
  readonly instanceId: number;
  readonly def: BuildingDef;
  readonly tileX: number;
  readonly tileY: number;
  // Centre-of-footprint world coords.
  readonly worldX: number;
  readonly worldY: number;
  hp: number;
  // Construction progress measured in worker-seconds. When this reaches
  // def.buildTimeSec the building flips to constructed = true.
  buildProgress = 0;
  isConstructed = false;
  // How many workers are currently contributing to this site (cap 3 per
  // §6.3). Mutated by Worker.update.
  activeBuilders = 0;
  // Workers currently tending this building (Phase 4: only farms use this
  // — they need a worker assigned to produce food, per Eden's spec
  // divergence; logged in §12).
  activeTenders = 0;
  private sprite: Phaser.GameObjects.Sprite;
  private highlight: Phaser.GameObjects.Rectangle | null = null;
  private dustTimer: Phaser.Time.TimerEvent | null = null;
  private progressBar: Phaser.GameObjects.Graphics;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, id: BuildingId, tileX: number, tileY: number) {
    this.scene = scene;
    this.instanceId = nextId++;
    this.def = BUILDING_DEFS[id];
    this.tileX = tileX;
    this.tileY = tileY;
    this.worldX = (tileX + this.def.footprint.w / 2) * TILE_SIZE;
    this.worldY = (tileY + this.def.footprint.h / 2) * TILE_SIZE;
    // Sites start at 10% HP per §6.3 spirit ("0% hp ghost"); we use a small
    // positive value so a half-built site can still register as standing.
    this.hp = Math.max(1, Math.floor(this.def.hpMax * 0.1));

    const south = (tileY + this.def.footprint.h) * TILE_SIZE;
    this.sprite = scene.add
      .sprite(this.worldX, south, `b_${id}`)
      .setOrigin(0.5, 1)
      .setDepth(south)
      .setAlpha(0.55)
      .setInteractive({ useHandCursor: true });
    this.sprite.setData('kind', 'building').setData('building', this);

    const tex = scene.textures.get(`b_${id}`).getSourceImage() as { width: number; height: number };
    const targetWidth = this.def.footprint.w * TILE_SIZE;
    const scale = targetWidth / Math.max(1, tex.width);
    this.sprite.setScale(scale);

    this.progressBar = scene.add.graphics().setDepth(south + 1);
    this.drawProgressBar();

    // Construction dust until the building completes.
    this.dustTimer = scene.time.addEvent({
      delay: 600,
      loop: true,
      callback: () => this.spawnDust(),
    });
  }

  // Yellow translucent footprint highlight for "this building is selected".
  setSelected(value: boolean): void {
    if (value && !this.highlight) {
      const w = this.def.footprint.w * TILE_SIZE;
      const h = this.def.footprint.h * TILE_SIZE;
      this.highlight = this.scene.add
        .rectangle(this.tileX * TILE_SIZE, this.tileY * TILE_SIZE, w, h, 0xffff66, 0.18)
        .setOrigin(0, 0)
        .setStrokeStyle(3, 0xffff66, 0.9)
        .setDepth(this.tileY * TILE_SIZE);
    } else if (!value && this.highlight) {
      this.highlight.destroy();
      this.highlight = null;
    }
  }

  private spawnDust(): void {
    if (this.isConstructed) return;
    const fp = this.def.footprint;
    const x = this.tileX * TILE_SIZE + Math.random() * fp.w * TILE_SIZE;
    const y = (this.tileY + fp.h - 1) * TILE_SIZE + Math.random() * TILE_SIZE;
    const dust = this.scene.add
      .circle(x, y, 4, 0xeed4b4, 0.75)
      .setDepth(y + 2);
    this.scene.tweens.add({
      targets: dust,
      y: y - 26,
      alpha: 0,
      duration: 850,
      onComplete: () => dust.destroy(),
    });
  }

  // Tile players walk to in order to interact with this building. South-
  // centre adjacent tile; far enough to never be inside the footprint.
  get interactionTile(): { tx: number; ty: number } {
    return {
      tx: this.tileX + Math.floor(this.def.footprint.w / 2),
      ty: this.tileY + this.def.footprint.h,
    };
  }

  // Tiles owned by this building (used by pathfinding to mark them
  // unwalkable). Constructed walls block; a half-built site also blocks
  // (workers route around their own teammates).
  *footprintTiles(): IterableIterator<{ tx: number; ty: number }> {
    for (let dy = 0; dy < this.def.footprint.h; dy++) {
      for (let dx = 0; dx < this.def.footprint.w; dx++) {
        yield { tx: this.tileX + dx, ty: this.tileY + dy };
      }
    }
  }

  // Targetable surface (matches Unit's): bandits (and any future hostile
  // units) can target buildings via Unit's combat code.
  get isAlive(): boolean {
    return this.hp > 0;
  }

  takeDamage(amount: number): void {
    if (this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.scene.events.emit('building-destroyed', this);
      this.destroy();
    }
  }

  // Used at game start for the Town Hall: skip the construction phase so
  // the building is born fully built without firing 'building-constructed'.
  markPrebuilt(): void {
    this.buildProgress = this.def.buildTimeSec;
    this.isConstructed = true;
    this.hp = this.def.hpMax;
    this.sprite.setAlpha(1);
    this.progressBar.destroy();
  }

  contributeBuild(seconds: number): void {
    if (this.isConstructed) return;
    this.buildProgress = Math.min(this.def.buildTimeSec, this.buildProgress + seconds);
    this.hp = Math.max(
      this.hp,
      Math.floor((this.buildProgress / this.def.buildTimeSec) * this.def.hpMax),
    );
    this.drawProgressBar();
    if (this.buildProgress >= this.def.buildTimeSec) {
      this.completeConstruction();
    }
  }

  private completeConstruction(): void {
    this.isConstructed = true;
    this.hp = this.def.hpMax;
    this.sprite.setAlpha(1);
    this.progressBar.destroy();
    if (this.dustTimer) {
      this.dustTimer.remove();
      this.dustTimer = null;
    }
    this.scene.events.emit('building-constructed', this);
  }

  private drawProgressBar(): void {
    if (this.isConstructed) return;
    const W = this.def.footprint.w * TILE_SIZE - 8;
    const H = 5;
    const x = this.tileX * TILE_SIZE + 4;
    const y = this.tileY * TILE_SIZE - 8;
    this.progressBar.clear();
    this.progressBar.fillStyle(0x000000, 0.7);
    this.progressBar.fillRect(x - 1, y - 1, W + 2, H + 2);
    this.progressBar.fillStyle(0x80ff80, 1);
    const ratio = this.buildProgress / this.def.buildTimeSec;
    this.progressBar.fillRect(x, y, Math.max(0, Math.floor(W * ratio)), H);
  }

  destroy(): void {
    this.sprite.destroy();
    this.progressBar.destroy();
    if (this.highlight) this.highlight.destroy();
    if (this.dustTimer) this.dustTimer.remove();
  }
}

import Phaser from 'phaser';
import { TILE_SIZE } from '../data/tiles';
import { BALANCE } from '../data/balance';

// Phase 2 placeholder tree: dark-green rounded rectangle on a tile.
// Single chop yields BALANCE.worker.yieldPerGather.wood, then the tree
// is "stumped" and regrows after BALANCE.tree.regrowSec.
export class Tree {
  readonly tileX: number;
  readonly tileY: number;
  readonly worldX: number;
  readonly worldY: number;
  private sprite: Phaser.GameObjects.Rectangle;
  private scene: Phaser.Scene;
  private _harvested = false;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    this.scene = scene;
    this.tileX = tileX;
    this.tileY = tileY;
    this.worldX = tileX * TILE_SIZE + TILE_SIZE / 2;
    this.worldY = tileY * TILE_SIZE + TILE_SIZE / 2;

    this.sprite = scene.add
      .rectangle(this.worldX, this.worldY, TILE_SIZE - 6, TILE_SIZE - 6, 0x2f6b1a)
      .setStrokeStyle(2, 0x14380a)
      .setDepth(10)
      .setInteractive();
    this.sprite.setData('kind', 'tree').setData('tree', this);
  }

  get isAvailable(): boolean {
    return !this._harvested;
  }

  // Called by a worker when chopping completes. Returns the wood yield.
  harvest(): number {
    if (this._harvested) return 0;
    this._harvested = true;
    this.sprite.setFillStyle(0x6b4a26).setStrokeStyle(2, 0x3a2810); // stump look
    this.sprite.disableInteractive();
    this.scene.time.delayedCall(BALANCE.tree.regrowSec * 1000, () => this.regrow());
    return BALANCE.worker.yieldPerGather.wood;
  }

  private regrow(): void {
    this._harvested = false;
    this.sprite.setFillStyle(0x2f6b1a).setStrokeStyle(2, 0x14380a);
    this.sprite.setInteractive();
  }

  destroy(): void {
    this.sprite.destroy();
  }
}

import Phaser from 'phaser';
import { TILE_SIZE } from '../data/tiles';
import { BALANCE } from '../data/balance';

// Phase 2 placeholder tree generated as a sprite from PreloadScene's
// procedurally-drawn texture. One chop yields BALANCE.worker.yieldPerGather
// .wood, then the sprite swaps to a stump and regrows after BALANCE.tree
// .regrowSec.
export class Tree {
  readonly tileX: number;
  readonly tileY: number;
  readonly worldX: number;
  readonly worldY: number;
  private sprite: Phaser.GameObjects.Sprite;
  private scene: Phaser.Scene;
  private _harvested = false;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    this.scene = scene;
    this.tileX = tileX;
    this.tileY = tileY;
    this.worldX = tileX * TILE_SIZE + TILE_SIZE / 2;
    this.worldY = tileY * TILE_SIZE + TILE_SIZE / 2;

    this.sprite = scene.add
      .sprite(this.worldX, this.worldY, 'tree')
      // Origin at base so the trunk sits on the tile and the canopy reads
      // as overlapping the row above.
      .setOrigin(0.5, 0.85)
      .setDepth(this.worldY)
      .setInteractive({ useHandCursor: true });
    this.sprite.setData('kind', 'tree').setData('tree', this);
  }

  get isAvailable(): boolean {
    return !this._harvested;
  }

  // Called by a worker when chopping completes. Returns the wood yield.
  harvest(): number {
    if (this._harvested) return 0;
    this._harvested = true;
    this.sprite.setTexture('tree-stump').setOrigin(0.5, 0.7);
    this.sprite.disableInteractive();
    this.scene.time.delayedCall(BALANCE.tree.regrowSec * 1000, () => this.regrow());
    return BALANCE.worker.yieldPerGather.wood;
  }

  private regrow(): void {
    this._harvested = false;
    this.sprite.setTexture('tree').setOrigin(0.5, 0.85);
    this.sprite.setInteractive({ useHandCursor: true });
  }

  destroy(): void {
    this.sprite.destroy();
  }
}

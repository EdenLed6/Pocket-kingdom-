import Phaser from 'phaser';
import { TILE_SIZE } from '../data/tiles';
import { BALANCE, NODE_TO_RESOURCE, type NodeKind, type ResourceType } from '../data/balance';

interface NodeConfig {
  kind: NodeKind;
  textureKey: string;
  stumpTextureKey: string | null; // null = sprite hidden when harvested
  origin: [number, number];
  // 0 means it never regrows; > 0 = seconds until respawn after harvest.
  regrowSec: number;
  yieldAmount: number;
  gatherTimeSec: number;
}

const CONFIGS: Record<NodeKind, NodeConfig> = {
  tree: {
    kind: 'tree',
    textureKey: 'tree',
    stumpTextureKey: 'tree-stump',
    origin: [0.5, 0.85],
    regrowSec: BALANCE.nodes.treeRegrowSec,
    yieldAmount: BALANCE.worker.yieldPerGather.wood,
    gatherTimeSec: BALANCE.worker.gatherTimeSec.wood,
  },
  rock: {
    kind: 'rock',
    textureKey: 'rock',
    stumpTextureKey: null,
    origin: [0.5, 0.7],
    regrowSec: 0, // §4.5: rocks don't regrow
    yieldAmount: BALANCE.worker.yieldPerGather.stone,
    gatherTimeSec: BALANCE.worker.gatherTimeSec.stone,
  },
  bush: {
    kind: 'bush',
    textureKey: 'bush',
    stumpTextureKey: 'bush-bare',
    origin: [0.5, 0.7],
    regrowSec: BALANCE.nodes.bushRegrowSec,
    yieldAmount: BALANCE.worker.yieldPerGather.food,
    gatherTimeSec: BALANCE.worker.gatherTimeSec.food,
  },
  animal: {
    kind: 'animal',
    textureKey: 'deer',
    stumpTextureKey: null,
    origin: [0.5, 0.85],
    regrowSec: BALANCE.nodes.animalRespawnSec,
    yieldAmount: BALANCE.worker.yieldPerGather.food,
    gatherTimeSec: BALANCE.worker.gatherTimeSec.food,
  },
};

// Phase 3 placeholder for any harvestable: tree, rock, bush, animal. Real
// art swaps in by changing the texture keys on the generated sprites.
export class ResourceNode {
  readonly kind: NodeKind;
  readonly resource: ResourceType;
  readonly tileX: number;
  readonly tileY: number;
  readonly worldX: number;
  readonly worldY: number;
  readonly yieldAmount: number;
  readonly gatherTimeSec: number;
  private cfg: NodeConfig;
  private sprite: Phaser.GameObjects.Sprite;
  private scene: Phaser.Scene;
  private _harvested = false;

  constructor(scene: Phaser.Scene, kind: NodeKind, tileX: number, tileY: number) {
    this.scene = scene;
    this.kind = kind;
    this.cfg = CONFIGS[kind];
    this.resource = NODE_TO_RESOURCE[kind];
    this.tileX = tileX;
    this.tileY = tileY;
    this.worldX = tileX * TILE_SIZE + TILE_SIZE / 2;
    this.worldY = tileY * TILE_SIZE + TILE_SIZE / 2;
    this.yieldAmount = this.cfg.yieldAmount;
    this.gatherTimeSec = this.cfg.gatherTimeSec;

    this.sprite = scene.add
      .sprite(this.worldX, this.worldY, this.cfg.textureKey)
      .setOrigin(this.cfg.origin[0], this.cfg.origin[1])
      .setDepth(this.worldY)
      .setInteractive({ useHandCursor: true });
    this.sprite.setData('kind', 'node').setData('node', this);
  }

  get isAvailable(): boolean {
    return !this._harvested;
  }

  // Called by a worker when chopping/mining/picking/hunting completes.
  // Returns the resource yield (0 if already harvested).
  harvest(): number {
    if (this._harvested) return 0;
    this._harvested = true;
    if (this.cfg.stumpTextureKey) {
      this.sprite.setTexture(this.cfg.stumpTextureKey).setOrigin(0.5, 0.7);
    } else {
      this.sprite.setVisible(false);
    }
    this.sprite.disableInteractive();
    if (this.cfg.regrowSec > 0) {
      this.scene.time.delayedCall(this.cfg.regrowSec * 1000, () => this.regrow());
    }
    return this.cfg.yieldAmount;
  }

  private regrow(): void {
    this._harvested = false;
    this.sprite
      .setTexture(this.cfg.textureKey)
      .setOrigin(this.cfg.origin[0], this.cfg.origin[1])
      .setVisible(true)
      .setInteractive({ useHandCursor: true });
  }

  destroy(): void {
    this.sprite.destroy();
  }
}

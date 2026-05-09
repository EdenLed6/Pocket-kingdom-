import Phaser from 'phaser';
import { TILE_SIZE } from '../data/tiles';
import { BALANCE, NODE_TO_RESOURCE, type NodeKind, type ResourceType } from '../data/balance';

interface NodeConfig {
  kind: NodeKind;
  textureKey: string;
  stumpTextureKey: string | null; // null = sprite hidden when depleted
  origin: [number, number];
  // 0 means it never regrows; > 0 = seconds to refill totalYield.
  regrowSec: number;
  yieldPerChop: number;
  totalYield: number;
  gatherTimeSec: number;
}

const CONFIGS: Record<NodeKind, NodeConfig> = {
  tree: {
    kind: 'tree',
    textureKey: 'tree',
    stumpTextureKey: 'tree-stump',
    origin: [0.5, 0.85],
    regrowSec: BALANCE.nodes.treeRegrowSec,
    yieldPerChop: BALANCE.nodes.yieldPerChop.tree,
    totalYield: BALANCE.nodes.totalYield.tree,
    gatherTimeSec: BALANCE.worker.gatherTimeSec.wood,
  },
  rock: {
    kind: 'rock',
    textureKey: 'rock',
    stumpTextureKey: null,
    origin: [0.5, 0.7],
    regrowSec: 0, // §4.5: rocks don't regrow
    yieldPerChop: BALANCE.nodes.yieldPerChop.rock,
    totalYield: BALANCE.nodes.totalYield.rock,
    gatherTimeSec: BALANCE.worker.gatherTimeSec.stone,
  },
  bush: {
    kind: 'bush',
    textureKey: 'bush',
    stumpTextureKey: 'bush-bare',
    origin: [0.5, 0.7],
    regrowSec: BALANCE.nodes.bushRegrowSec,
    yieldPerChop: BALANCE.nodes.yieldPerChop.bush,
    totalYield: BALANCE.nodes.totalYield.bush,
    gatherTimeSec: BALANCE.worker.gatherTimeSec.food,
  },
  animal: {
    kind: 'animal',
    textureKey: 'deer',
    stumpTextureKey: null,
    origin: [0.5, 0.85],
    regrowSec: BALANCE.nodes.animalRespawnSec,
    yieldPerChop: BALANCE.nodes.yieldPerChop.animal,
    totalYield: BALANCE.nodes.totalYield.animal,
    gatherTimeSec: BALANCE.worker.gatherTimeSec.food,
  },
};

// Phase 4+ harvestable resource node (AoM-style multi-chop). Each chop
// yields cfg.yieldPerChop; the node stays available until cfg.totalYield
// is drained over many trips, then stumps / vanishes (and regrows after
// cfg.regrowSec for trees / bushes / animals).
export class ResourceNode {
  readonly kind: NodeKind;
  readonly resource: ResourceType;
  readonly tileX: number;
  readonly tileY: number;
  readonly worldX: number;
  readonly worldY: number;
  readonly gatherTimeSec: number;
  private cfg: NodeConfig;
  private sprite: Phaser.GameObjects.Sprite;
  private scene: Phaser.Scene;
  private remaining: number;

  constructor(scene: Phaser.Scene, kind: NodeKind, tileX: number, tileY: number) {
    this.scene = scene;
    this.kind = kind;
    this.cfg = CONFIGS[kind];
    this.resource = NODE_TO_RESOURCE[kind];
    this.tileX = tileX;
    this.tileY = tileY;
    this.worldX = tileX * TILE_SIZE + TILE_SIZE / 2;
    this.worldY = tileY * TILE_SIZE + TILE_SIZE / 2;
    this.gatherTimeSec = this.cfg.gatherTimeSec;
    this.remaining = this.cfg.totalYield;

    this.sprite = scene.add
      .sprite(this.worldX, this.worldY, this.cfg.textureKey)
      .setOrigin(this.cfg.origin[0], this.cfg.origin[1])
      .setDepth(this.worldY)
      .setInteractive({ useHandCursor: true });
    this.sprite.setData('kind', 'node').setData('node', this);
  }

  get isAvailable(): boolean {
    return this.remaining > 0;
  }

  // Harvest one chop. Returns the actual yield (clipped if the node has
  // less left than cfg.yieldPerChop). Triggers stump / regrow when drained.
  harvest(): number {
    if (this.remaining <= 0) return 0;
    const got = Math.min(this.cfg.yieldPerChop, this.remaining);
    this.remaining -= got;
    if (this.remaining <= 0) this.deplete();
    else this.updateVisualWear();
    return got;
  }

  private deplete(): void {
    if (this.cfg.stumpTextureKey) {
      this.sprite.setTexture(this.cfg.stumpTextureKey).setOrigin(0.5, 0.7);
    } else {
      this.sprite.setVisible(false);
    }
    this.sprite.disableInteractive();
    if (this.cfg.regrowSec > 0) {
      this.scene.time.delayedCall(this.cfg.regrowSec * 1000, () => this.regrow());
    }
  }

  // Visual cue: alpha drops as the node depletes so a half-chopped tree
  // looks visibly thinner. Cheap (no extra sprites).
  private updateVisualWear(): void {
    const ratio = this.remaining / this.cfg.totalYield;
    this.sprite.setAlpha(0.55 + 0.45 * ratio);
  }

  private regrow(): void {
    this.remaining = this.cfg.totalYield;
    this.sprite
      .setTexture(this.cfg.textureKey)
      .setOrigin(this.cfg.origin[0], this.cfg.origin[1])
      .setAlpha(1)
      .setVisible(true)
      .setInteractive({ useHandCursor: true });
  }

  destroy(): void {
    this.sprite.destroy();
  }
}

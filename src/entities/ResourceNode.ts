import Phaser from 'phaser';
import { TILE_SIZE } from '../data/tiles';
import { BALANCE, NODE_TO_RESOURCE, type NodeKind, type ResourceType } from '../data/balance';

interface NodeConfig {
  kind: NodeKind;
  // For trees, this is a *base* — actual key picks a variant 1-4 at spawn.
  textureKey: string;
  stumpTextureKey: string | null; // null = sprite hidden when depleted
  origin: [number, number];
  scale: number;
  regrowSec: number; // 0 = never regrow
  yieldPerChop: number;
  totalYield: number;
  gatherTimeSec: number;
}

const CONFIGS: Record<NodeKind, NodeConfig> = {
  tree: {
    kind: 'tree',
    textureKey: 'tree_v1', // overridden per-instance to a 1..4 variant
    stumpTextureKey: 'stump_v1',
    origin: [0.5, 0.95],
    // Tiny Swords trees are 192×256; scale to ~85px wide so they sit nicely
    // on a 64-px tile and read taller than 1 tile (correct for trees).
    scale: 0.45,
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
    // rock1 is already 64×64 — full size matches the tile.
    scale: 1.0,
    regrowSec: 0,
    yieldPerChop: BALANCE.nodes.yieldPerChop.rock,
    totalYield: BALANCE.nodes.totalYield.rock,
    gatherTimeSec: BALANCE.worker.gatherTimeSec.stone,
  },
  bush: {
    kind: 'bush',
    textureKey: 'bush',
    stumpTextureKey: 'bush-bare',
    origin: [0.5, 0.75],
    scale: 0.55, // 128 → 70 px
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
    scale: 0.6, // 128 → 77 px
    regrowSec: BALANCE.nodes.animalRespawnSec,
    yieldPerChop: BALANCE.nodes.yieldPerChop.animal,
    totalYield: BALANCE.nodes.totalYield.animal,
    gatherTimeSec: BALANCE.worker.gatherTimeSec.food,
  },
};

export class ResourceNode {
  readonly kind: NodeKind;
  readonly resource: ResourceType;
  readonly tileX: number;
  readonly tileY: number;
  readonly worldX: number;
  readonly worldY: number;
  readonly gatherTimeSec: number;
  private cfg: NodeConfig;
  private treeVariant: number;
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

    // Trees: roll a 1..4 variant for AoM-style forest variety.
    this.treeVariant = kind === 'tree' ? Phaser.Math.Between(1, 4) : 1;
    const initialKey = kind === 'tree' ? `tree_v${this.treeVariant}` : this.cfg.textureKey;

    this.sprite = scene.add
      .sprite(this.worldX, this.worldY, initialKey)
      .setOrigin(this.cfg.origin[0], this.cfg.origin[1])
      .setScale(this.cfg.scale)
      .setDepth(this.worldY)
      .setInteractive({ useHandCursor: true });
    this.sprite.setData('kind', 'node').setData('node', this);
  }

  get isAvailable(): boolean {
    return this.remaining > 0;
  }

  harvest(): number {
    if (this.remaining <= 0) return 0;
    const got = Math.min(this.cfg.yieldPerChop, this.remaining);
    this.remaining -= got;
    if (this.remaining <= 0) this.deplete();
    else this.updateVisualWear();
    return got;
  }

  private deplete(): void {
    if (this.kind === 'tree') {
      this.sprite.setTexture(`stump_v${this.treeVariant}`).setOrigin(0.5, 0.85).setAlpha(1);
    } else if (this.cfg.stumpTextureKey) {
      this.sprite.setTexture(this.cfg.stumpTextureKey).setOrigin(0.5, 0.7).setAlpha(1);
    } else {
      this.sprite.setVisible(false);
    }
    this.sprite.disableInteractive();
    if (this.cfg.regrowSec > 0) {
      this.scene.time.delayedCall(this.cfg.regrowSec * 1000, () => this.regrow());
    }
  }

  private updateVisualWear(): void {
    const ratio = this.remaining / this.cfg.totalYield;
    this.sprite.setAlpha(0.6 + 0.4 * ratio);
  }

  private regrow(): void {
    this.remaining = this.cfg.totalYield;
    const key = this.kind === 'tree' ? `tree_v${this.treeVariant}` : this.cfg.textureKey;
    this.sprite
      .setTexture(key)
      .setOrigin(this.cfg.origin[0], this.cfg.origin[1])
      .setAlpha(1)
      .setVisible(true)
      .setInteractive({ useHandCursor: true });
  }

  destroy(): void {
    this.sprite.destroy();
  }
}

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
    textureKey: 'rock_v1', // overridden per-instance with a 1..5 variant
    stumpTextureKey: null,
    origin: [0.5, 0.7],
    // Source rocks are mixed 64x64 / 128x128 — base scale tuned per
    // variant in the constructor.
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
    origin: [0.5, 0.85],
    // berry_bush.png is 64×64 native — at scale 1.0 it sits at one
    // tile, slightly bigger than rocks/sheep so the fruit reads.
    scale: 1.0,
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
  private berries: Phaser.GameObjects.Sprite | null = null;
  private scene: Phaser.Scene;
  private remaining: number;
  // Visible position is whatever the spawner asked for — may be sub-tile,
  // off-tile-centre, or even between tiles. tileX/tileY are derived (floor)
  // and used by Worker pathfinding which still operates at tile resolution.
  private visX: number;
  private visY: number;

  // Spawner passes a precise pixel position. tileX/tileY = floor(world/T).
  constructor(scene: Phaser.Scene, kind: NodeKind, worldX: number, worldY: number) {
    this.scene = scene;
    this.kind = kind;
    this.cfg = CONFIGS[kind];
    this.resource = NODE_TO_RESOURCE[kind];
    this.tileX = Math.floor(worldX / TILE_SIZE);
    this.tileY = Math.floor(worldY / TILE_SIZE);
    this.worldX = worldX;
    this.worldY = worldY;
    this.gatherTimeSec = this.cfg.gatherTimeSec;
    this.remaining = this.cfg.totalYield;

    // Trees: roll a 1..4 variant for AoM-style forest variety.
    this.treeVariant = kind === 'tree' ? Phaser.Math.Between(1, 4) : 1;
    // Rocks: 1..3 grey boulder variants (no gold-stones — they read as
    // gold ore not stone, per Eden's playtest).
    const rockVariant = kind === 'rock' ? Phaser.Math.Between(1, 3) : 1;
    const initialKey =
      kind === 'tree'
        ? `tree_v${this.treeVariant}`
        : kind === 'rock'
          ? `rock_v${rockVariant}`
          : this.cfg.textureKey;

    // No internal jitter: the spawner already passes a sub-tile pixel
    // position. visX/visY just mirror world coords for the sprite.
    this.visX = worldX;
    this.visY = worldY;

    // Per-instance scale variance + per-variant base scale.
    const h3 = ((Math.floor(worldX) * 50331653) ^ (Math.floor(worldY) * 12582917)) >>> 0;
    const variance = ((h3 % 1000) / 1000) * 0.2 - 0.07;
    let baseScale = this.cfg.scale;
    if (kind === 'tree') {
      baseScale = this.cfg.scale + variance;
    } else if (kind === 'rock') {
      // rock_v1..3 are 64×64 (display ~tile-sized at 1.0); gold_stone v4/v5
      // are 128×128 so they need 0.5 to match. Add ±0.15 size variance.
      const tile64 = rockVariant <= 3;
      baseScale = (tile64 ? 0.95 : 0.5) + variance * 0.6;
    }

    this.sprite = scene.add
      .sprite(this.visX, this.visY, initialKey)
      .setOrigin(this.cfg.origin[0], this.cfg.origin[1])
      .setScale(baseScale)
      .setDepth(this.visY)
      .setInteractive({ useHandCursor: true });
    // Random horizontal flip for trees + rocks — doubles the visual
    // silhouettes for free, breaks the "all trees face the same way"
    // alignment hint that helped read forests as rows.
    if (kind === 'tree' || kind === 'rock') {
      const flipHash = ((Math.floor(worldX) * 12345) ^ (Math.floor(worldY) * 67890)) >>> 0;
      if ((flipHash & 1) === 1) this.sprite.setFlipX(true);
    }
    this.sprite.setData('kind', 'node').setData('node', this);

    // Bushes get a small red-berry overlay so they read as fruit bushes.
    // Bushes used to get a procedural bush_berries overlay; Eden didn't
    // like the look so it's gone. Plain Tiny Swords bush stands alone
    // until we wire a proper berry sprite from another source.
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
    this.sprite.disableInteractive();
    // Trees actually FALL: tilt rotation + drop slightly before swapping
    // to a stump. Eden's request: "the tree should fall when chopped".
    if (this.kind === 'tree') {
      this.scene.tweens.add({
        targets: this.sprite,
        angle: -45,
        y: this.sprite.y + 6,
        duration: 450,
        ease: 'Cubic.in',
        onComplete: () => this.swapToDepleted(),
      });
      return;
    }
    this.swapToDepleted();
  }

  private swapToDepleted(): void {
    // Reset the rotation that the fall tween left.
    this.sprite.setAngle(0).setPosition(this.visX, this.visY);
    if (this.kind === 'tree') {
      this.sprite.setTexture(`stump_v${this.treeVariant}`).setOrigin(0.5, 0.85).setAlpha(1);
    } else if (this.cfg.stumpTextureKey) {
      this.sprite.setTexture(this.cfg.stumpTextureKey).setOrigin(0.5, 0.7).setAlpha(1);
    } else {
      this.sprite.setVisible(false);
    }
    if (this.berries) this.berries.setVisible(false);
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
      .setAngle(0)
      .setPosition(this.visX, this.visY)
      .setVisible(true)
      .setInteractive({ useHandCursor: true });
    if (this.berries) this.berries.setVisible(true);
  }

  // Save/load (§6.7).
  snapshot(): { kind: NodeKind; worldX: number; worldY: number; remaining: number } {
    return {
      kind: this.kind,
      worldX: this.worldX,
      worldY: this.worldY,
      remaining: this.remaining,
    };
  }

  setRemaining(amount: number): void {
    this.remaining = Math.max(0, Math.min(this.cfg.totalYield, amount));
    if (this.remaining <= 0) {
      this.deplete();
    } else {
      this.updateVisualWear();
    }
  }

  destroy(): void {
    this.sprite.destroy();
    if (this.berries) this.berries.destroy();
  }
}

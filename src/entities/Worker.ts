import Phaser from 'phaser';
import { TILE_SIZE } from '../data/tiles';
import { BALANCE, type ResourceType } from '../data/balance';
import { findPath, type TileXY } from '../utils/pathfinding';
import type { ResourceNode } from './ResourceNode';

type IsWalkable = (tx: number, ty: number) => boolean;

interface WorkerDeps {
  mapWidthTiles: number;
  mapHeightTiles: number;
  isWalkable: IsWalkable;
  // Resolves the tile a fully-loaded worker should walk back to. For Phase 3
  // this is still the tile just south of the Town Hall (only dropoff).
  getDropoffTile: () => TileXY;
  // Called when the worker actually deposits cargo at the dropoff. Returns
  // how much was accepted (resource cap may clip it).
  deposit: (resource: ResourceType, amount: number) => number;
  // Find another node of the same resource type to chain to once the
  // current one is exhausted. May return null when nothing is available.
  findNearestNode: (
    fromX: number,
    fromY: number,
    resource: ResourceType,
  ) => ResourceNode | null;
}

type State =
  | { kind: 'idle' }
  | { kind: 'moving-to-node'; node: ResourceNode }
  | { kind: 'gathering'; node: ResourceNode; remainingSec: number }
  | { kind: 'moving-to-dropoff'; afterNode: ResourceNode | null }
  | { kind: 'depositing' };

const CARRY_TINT_BY_RESOURCE: Record<ResourceType, number> = {
  wood: 0xc8ffb0,
  stone: 0xb0c0d0,
  food: 0xffd070,
};

export class Worker {
  readonly id: number;
  private deps: WorkerDeps;
  private sprite: Phaser.GameObjects.Sprite;
  private ring: Phaser.GameObjects.Sprite;
  private state: State = { kind: 'idle' };
  private inventoryAmount = 0;
  private inventoryResource: ResourceType | null = null;
  private path: { x: number; y: number }[] = [];
  private _selected = false;
  // Once the player gives a worker any node, it keeps gathering nearby
  // nodes of the same resource type after each drop-off. Cleared only
  // when nothing is available.
  private autoResource: ResourceType | null = null;

  constructor(id: number, scene: Phaser.Scene, tileX: number, tileY: number, deps: WorkerDeps) {
    this.id = id;
    this.deps = deps;
    const wx = tileX * TILE_SIZE + TILE_SIZE / 2;
    const wy = tileY * TILE_SIZE + TILE_SIZE / 2;

    this.ring = scene.add
      .sprite(wx, wy + 6, 'select-ring')
      .setDepth(19)
      .setVisible(false);

    this.sprite = scene.add
      .sprite(wx, wy, 'worker')
      .setOrigin(0.5, 0.9)
      .setDepth(20)
      .setInteractive({ useHandCursor: true });
    this.sprite.setData('kind', 'worker').setData('worker', this);
  }

  get worldX(): number {
    return this.sprite.x;
  }

  get worldY(): number {
    return this.sprite.y;
  }

  get tileX(): number {
    return Math.floor(this.sprite.x / TILE_SIZE);
  }

  get tileY(): number {
    return Math.floor(this.sprite.y / TILE_SIZE);
  }

  get isSelected(): boolean {
    return this._selected;
  }

  setSelected(value: boolean): void {
    this._selected = value;
    this.ring.setVisible(value);
  }

  // Player command: gather from this node, then drop off, then auto-continue
  // to nearby nodes of the same resource type until told otherwise.
  assignNode(node: ResourceNode): void {
    this.autoResource = node.resource;
    if (!node.isAvailable) {
      this.chainToNearest();
      return;
    }
    if (this.inventoryAmount > 0 && this.inventoryResource !== node.resource) {
      // Holding the wrong resource: drop off first, then try to chain.
      this.startMoveToDropoff(null);
      return;
    }
    if (this.inventoryAmount >= BALANCE.worker.carryCapacity) {
      this.startMoveToDropoff(node);
      return;
    }
    this.startMoveToNode(node);
  }

  private startMoveToNode(node: ResourceNode): void {
    const path = this.computePath({ tx: node.tileX, ty: node.tileY });
    if (!path) return;
    this.path = pathToWaypoints(path);
    this.state = { kind: 'moving-to-node', node };
  }

  private startMoveToDropoff(afterNode: ResourceNode | null): void {
    const dropoff = this.deps.getDropoffTile();
    const path = this.computePath(dropoff);
    if (!path) return;
    this.path = pathToWaypoints(path);
    this.state = { kind: 'moving-to-dropoff', afterNode };
  }

  private computePath(goal: TileXY): TileXY[] | null {
    const start: TileXY = { tx: this.tileX, ty: this.tileY };
    return findPath(
      start,
      goal,
      this.deps.mapWidthTiles,
      this.deps.mapHeightTiles,
      this.deps.isWalkable,
    );
  }

  private chainToNearest(): void {
    if (!this.autoResource) {
      this.state = { kind: 'idle' };
      return;
    }
    const next = this.deps.findNearestNode(this.sprite.x, this.sprite.y, this.autoResource);
    if (next) {
      this.startMoveToNode(next);
    } else {
      this.autoResource = null;
      this.state = { kind: 'idle' };
    }
  }

  update(dtSec: number): void {
    if (this._selected) {
      this.ring.setPosition(this.sprite.x, this.sprite.y + 4);
    }
    this.sprite.setDepth(this.sprite.y);
    this.ring.setDepth(this.sprite.y - 1);

    switch (this.state.kind) {
      case 'idle':
        return;

      case 'moving-to-node':
      case 'moving-to-dropoff':
        this.advanceAlongPath(dtSec);
        return;

      case 'gathering': {
        this.state.remainingSec -= dtSec;
        if (this.state.remainingSec <= 0) {
          const node = this.state.node;
          const yield_ = node.harvest();
          this.inventoryAmount += yield_;
          this.inventoryResource = node.resource;
          this.sprite.setTint(CARRY_TINT_BY_RESOURCE[node.resource]);
          this.startMoveToDropoff(null);
        }
        return;
      }

      case 'depositing':
        return;
    }
  }

  private advanceAlongPath(dtSec: number): void {
    const speed = BALANCE.worker.speedPxPerSec;
    let budget = speed * dtSec;
    while (budget > 0 && this.path.length > 0) {
      const next = this.path[0];
      const dx = next.x - this.sprite.x;
      const dy = next.y - this.sprite.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= budget) {
        this.sprite.x = next.x;
        this.sprite.y = next.y;
        budget -= dist;
        this.path.shift();
      } else {
        this.sprite.x += (dx / dist) * budget;
        this.sprite.y += (dy / dist) * budget;
        budget = 0;
      }
    }
    if (this.path.length === 0) {
      this.onArrived();
    }
  }

  private onArrived(): void {
    if (this.state.kind === 'moving-to-node') {
      const node = this.state.node;
      if (!node.isAvailable) {
        this.chainToNearest();
        return;
      }
      this.state = {
        kind: 'gathering',
        node,
        remainingSec: node.gatherTimeSec,
      };
      return;
    }

    if (this.state.kind === 'moving-to-dropoff') {
      const afterNode = this.state.afterNode;
      this.state = { kind: 'depositing' };
      if (this.inventoryResource && this.inventoryAmount > 0) {
        const accepted = this.deps.deposit(this.inventoryResource, this.inventoryAmount);
        this.inventoryAmount = Math.max(0, this.inventoryAmount - accepted);
        if (this.inventoryAmount === 0) this.inventoryResource = null;
      }
      this.sprite.clearTint();

      if (afterNode && afterNode.isAvailable && this.inventoryAmount === 0) {
        this.startMoveToNode(afterNode);
      } else {
        this.chainToNearest();
      }
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.ring.destroy();
  }
}

function pathToWaypoints(path: TileXY[]): { x: number; y: number }[] {
  // Skip the first tile (current position) so we don't snap backwards on
  // sub-pixel offsets.
  const waypoints: { x: number; y: number }[] = [];
  for (let i = 1; i < path.length; i++) {
    waypoints.push({
      x: path[i].tx * TILE_SIZE + TILE_SIZE / 2,
      y: path[i].ty * TILE_SIZE + TILE_SIZE / 2,
    });
  }
  return waypoints;
}

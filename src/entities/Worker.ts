import Phaser from 'phaser';
import { TILE_SIZE } from '../data/tiles';
import { BALANCE } from '../data/balance';
import { findPath, type TileXY } from '../utils/pathfinding';
import type { Tree } from './Tree';

type IsWalkable = (tx: number, ty: number) => boolean;

interface WorkerDeps {
  mapWidthTiles: number;
  mapHeightTiles: number;
  isWalkable: IsWalkable;
  // Resolves the tile a fully-loaded worker should walk back to. For Phase 2
  // this is the tile just south of the Town Hall (only dropoff in the world).
  getDropoffTile: () => TileXY;
  // Called when the worker actually deposits cargo at the dropoff. Returns
  // how much was accepted (resource cap may clip it).
  depositWood: (amount: number) => number;
  // Find another tree to chain to once the assigned one is stumped. May
  // return null when nothing is available.
  findNearestTree: (fromX: number, fromY: number) => Tree | null;
}

type State =
  | { kind: 'idle' }
  | { kind: 'moving-to-tree'; tree: Tree }
  | { kind: 'gathering'; tree: Tree; remainingSec: number }
  | { kind: 'moving-to-dropoff'; afterTree: Tree | null }
  | { kind: 'depositing' };

const CARRY_TINT = 0xc8ffb0;

export class Worker {
  readonly id: number;
  private deps: WorkerDeps;
  private sprite: Phaser.GameObjects.Sprite;
  private ring: Phaser.GameObjects.Sprite;
  private state: State = { kind: 'idle' };
  private inventoryWood = 0;
  private path: { x: number; y: number }[] = [];
  private _selected = false;
  // Once the player gives a worker any tree, it keeps gathering nearby
  // trees after each drop-off. Cleared only when nothing is available.
  private autoGather = false;

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

  // Player command: gather from this tree, then drop off, then auto-continue
  // to nearby trees until told otherwise (or none remain).
  assignTree(tree: Tree): void {
    this.autoGather = true;
    if (!tree.isAvailable) {
      this.chainToNearest();
      return;
    }
    if (this.inventoryWood > 0) {
      // Already carrying: deliver first, then come back to this tree.
      this.startMoveToDropoff(tree);
      return;
    }
    this.startMoveToTree(tree);
  }

  private startMoveToTree(tree: Tree): void {
    const path = this.computePath({ tx: tree.tileX, ty: tree.tileY });
    if (!path) return;
    this.path = pathToWaypoints(path);
    this.state = { kind: 'moving-to-tree', tree };
  }

  private startMoveToDropoff(afterTree: Tree | null): void {
    const dropoff = this.deps.getDropoffTile();
    const path = this.computePath(dropoff);
    if (!path) return;
    this.path = pathToWaypoints(path);
    this.state = { kind: 'moving-to-dropoff', afterTree };
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
    if (!this.autoGather) {
      this.state = { kind: 'idle' };
      return;
    }
    const next = this.deps.findNearestTree(this.sprite.x, this.sprite.y);
    if (next) {
      this.startMoveToTree(next);
    } else {
      this.autoGather = false;
      this.state = { kind: 'idle' };
    }
  }

  update(dtSec: number): void {
    // Keep ring under the worker's feet and depth-sorted with body so trees
    // overlap correctly as the worker walks past them.
    if (this._selected) {
      this.ring.setPosition(this.sprite.x, this.sprite.y + 4);
    }
    this.sprite.setDepth(this.sprite.y);
    this.ring.setDepth(this.sprite.y - 1);

    switch (this.state.kind) {
      case 'idle':
        return;

      case 'moving-to-tree':
      case 'moving-to-dropoff':
        this.advanceAlongPath(dtSec);
        return;

      case 'gathering': {
        this.state.remainingSec -= dtSec;
        if (this.state.remainingSec <= 0) {
          const tree = this.state.tree;
          const yield_ = tree.harvest();
          this.inventoryWood += yield_;
          this.sprite.setTint(CARRY_TINT);
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
    if (this.state.kind === 'moving-to-tree') {
      const tree = this.state.tree;
      if (!tree.isAvailable) {
        this.chainToNearest();
        return;
      }
      this.state = {
        kind: 'gathering',
        tree,
        remainingSec: BALANCE.worker.gatherTimeSec.wood,
      };
      return;
    }

    if (this.state.kind === 'moving-to-dropoff') {
      const afterTree = this.state.afterTree;
      this.state = { kind: 'depositing' };
      const accepted = this.deps.depositWood(this.inventoryWood);
      this.inventoryWood = Math.max(0, this.inventoryWood - accepted);
      this.sprite.clearTint();

      if (afterTree && afterTree.isAvailable && this.inventoryWood === 0) {
        this.startMoveToTree(afterTree);
      } else {
        // Either the assigned tree is gone or we still have unflushed wood
        // (storage cap). Either way: try to chain. If cap was hit, this just
        // sends us back out; the next deposit will be 0 and we'll keep trying.
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

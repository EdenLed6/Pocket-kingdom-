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
}

type State =
  | { kind: 'idle' }
  | { kind: 'moving-to-tree'; tree: Tree }
  | { kind: 'gathering'; tree: Tree; remainingSec: number }
  | { kind: 'moving-to-dropoff'; afterTree: Tree | null }
  | { kind: 'depositing' };

const SELECTED_OUTLINE_COLOR = 0xffff66;
const NORMAL_OUTLINE_COLOR = 0x222222;

export class Worker {
  readonly id: number;
  private deps: WorkerDeps;
  private sprite: Phaser.GameObjects.Rectangle;
  private state: State = { kind: 'idle' };
  private inventoryWood = 0;
  // Path is a list of *world-pixel-center* waypoints to walk through.
  private path: { x: number; y: number }[] = [];
  private _selected = false;

  constructor(id: number, scene: Phaser.Scene, tileX: number, tileY: number, deps: WorkerDeps) {
    this.id = id;
    this.deps = deps;
    const wx = tileX * TILE_SIZE + TILE_SIZE / 2;
    const wy = tileY * TILE_SIZE + TILE_SIZE / 2;
    this.sprite = scene.add
      .rectangle(wx, wy, 14, 18, 0xf0c070)
      .setStrokeStyle(2, NORMAL_OUTLINE_COLOR)
      .setDepth(20)
      .setInteractive();
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
    this.sprite.setStrokeStyle(2, value ? SELECTED_OUTLINE_COLOR : NORMAL_OUTLINE_COLOR);
  }

  // Player command: gather from this tree, then drop off, then loop back.
  assignTree(tree: Tree): void {
    if (!tree.isAvailable) return;
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

  update(dtSec: number): void {
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
          // Visual cue: tint sprite slightly while carrying.
          this.sprite.setFillStyle(0xa0d060);
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
        // Someone else got it / it stumped while we walked.
        this.state = { kind: 'idle' };
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
      // Drop visual carry tint.
      this.sprite.setFillStyle(0xf0c070);
      // If we still have an assigned tree and capacity, go back.
      if (afterTree && afterTree.isAvailable && this.inventoryWood === 0) {
        this.startMoveToTree(afterTree);
      } else {
        this.state = { kind: 'idle' };
      }
    }
  }

  destroy(): void {
    this.sprite.destroy();
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

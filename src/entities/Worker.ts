import Phaser from 'phaser';
import { TILE_SIZE } from '../data/tiles';
import { BALANCE, type ResourceType } from '../data/balance';
import { findPath, type TileXY } from '../utils/pathfinding';
import type { ResourceNode } from './ResourceNode';
import type { Building } from './Building';

type IsWalkable = (tx: number, ty: number) => boolean;

interface WorkerDeps {
  mapWidthTiles: number;
  mapHeightTiles: number;
  isWalkable: IsWalkable;
  // Resolves the tile a fully-loaded worker should walk back to. AoM-style:
  // the nearest building that accepts the resource (Town Hall always; plus
  // Lumber Mill for wood, Quarry for stone, Farm / Hunter's Lodge for food).
  getDropoffTile: (resource: ResourceType, fromX: number, fromY: number) => TileXY;
  // Returns the amount actually accepted (resource cap may clip it). The
  // dropoff position lets GameScene apply Lumber Mill / Quarry / Lodge
  // bonuses when the worker is depositing AT one of those buildings.
  deposit: (resource: ResourceType, amount: number, atTile: TileXY) => number;
  findNearestNode: (
    fromX: number,
    fromY: number,
    resource: ResourceType,
  ) => ResourceNode | null;
  findNearestSite: (fromX: number, fromY: number) => Building | null;
}

type State =
  | { kind: 'idle' }
  | { kind: 'moving-to-node'; node: ResourceNode }
  | { kind: 'gathering'; node: ResourceNode; remainingSec: number }
  | { kind: 'moving-to-dropoff'; afterNode: ResourceNode | null }
  | { kind: 'depositing' }
  | { kind: 'moving-to-site'; site: Building }
  | { kind: 'building'; site: Building }
  | { kind: 'moving-to-farm'; farm: Building }
  | { kind: 'tending'; farm: Building };

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
  // Latched player intent. After completing one task the worker chains to
  // the nearest equivalent target (same resource for gather, any unfinished
  // site for build) until none remains.
  private autoMode: 'gather' | 'build' | null = null;
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

    // Tiny Swords pawn frame is 192×192 with lots of empty space; scale to
    // ~76 px so it sits around 1 tile (TILE_SIZE = 64) with feet on the
    // tile centre.
    this.sprite = scene.add
      .sprite(wx, wy, 'worker')
      .setOrigin(0.5, 0.85)
      .setScale(0.4)
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

  assignNode(node: ResourceNode): void {
    this.releaseBuildingSlot();
    this.autoMode = 'gather';
    this.autoResource = node.resource;
    if (!node.isAvailable) {
      this.chainAfterAssignment();
      return;
    }
    if (this.inventoryAmount > 0 && this.inventoryResource !== node.resource) {
      // Wrong cargo: drop off first, then come back to THIS specific node.
      this.pendingNodeAfterDeposit = node;
      this.startMoveToDropoff(null);
      return;
    }
    if (this.inventoryAmount >= BALANCE.worker.carryCapacity) {
      this.startMoveToDropoff(node);
      return;
    }
    this.startMoveToNode(node);
  }

  assignSite(site: Building): void {
    this.releaseBuildingSlot();
    this.autoMode = 'build';
    this.autoResource = null;
    if (site.isConstructed) {
      // Already-built farm: treat the assignment as "tend this farm".
      if (site.def.id === 'farm') {
        this.assignFarm(site);
        return;
      }
      this.chainAfterAssignment();
      return;
    }
    if (this.inventoryAmount > 0) {
      // Stash cargo first; the chain after deposit will pick this site (or
      // the next nearest) automatically.
      this.startMoveToDropoff(null);
      return;
    }
    this.startMoveToSite(site);
  }

  // Eden's request: farms only produce food while a worker is actively
  // tending them. Worker walks to the farm and stays there until reassigned.
  assignFarm(farm: Building): void {
    this.releaseBuildingSlot();
    this.autoMode = null;
    this.autoResource = null;
    if (this.inventoryAmount > 0) {
      // Drop cargo first; we'll come back via the autoMode-less chain.
      this.startMoveToDropoff(null);
      // Re-target after deposit by re-calling assignFarm.
      // (We piggyback on currentDropoff arrival via onArrived's idle return,
      // then user can re-tap.) Simpler: just tend after drop:
      this.pendingFarmAfterDeposit = farm;
      return;
    }
    this.startMoveToFarm(farm);
  }

  private pendingFarmAfterDeposit: Building | null = null;
  // When the player taps a specific node but the worker has wrong cargo,
  // we route them to drop off first, then return to THIS node (not just
  // the nearest one) so the explicit tap is honoured.
  private pendingNodeAfterDeposit: ResourceNode | null = null;

  private startMoveToFarm(farm: Building): void {
    const path = this.computePath(farm.interactionTile);
    if (!path) return;
    this.path = pathToWaypoints(path);
    this.state = { kind: 'moving-to-farm', farm };
  }

  private releaseBuildingSlot(): void {
    if (this.state.kind === 'building') {
      this.state.site.activeBuilders = Math.max(0, this.state.site.activeBuilders - 1);
    } else if (this.state.kind === 'tending') {
      this.state.farm.activeTenders = Math.max(0, this.state.farm.activeTenders - 1);
    }
  }

  private startMoveToNode(node: ResourceNode): void {
    const path = this.computePath({ tx: node.tileX, ty: node.tileY });
    if (!path) return;
    this.path = pathToWaypoints(path);
    this.state = { kind: 'moving-to-node', node };
  }

  private currentDropoff: TileXY | null = null;

  private startMoveToDropoff(afterNode: ResourceNode | null): void {
    const resource = this.inventoryResource ?? 'wood';
    const dropoff = this.deps.getDropoffTile(resource, this.sprite.x, this.sprite.y);
    this.currentDropoff = dropoff;
    const path = this.computePath(dropoff);
    if (!path) return;
    this.path = pathToWaypoints(path);
    this.state = { kind: 'moving-to-dropoff', afterNode };
  }

  private startMoveToSite(site: Building): void {
    const path = this.computePath(site.interactionTile);
    if (!path) return;
    this.path = pathToWaypoints(path);
    this.state = { kind: 'moving-to-site', site };
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

  private chainAfterAssignment(): void {
    if (this.autoMode === 'gather' && this.autoResource) {
      const next = this.deps.findNearestNode(this.sprite.x, this.sprite.y, this.autoResource);
      if (next) {
        this.startMoveToNode(next);
        return;
      }
      this.autoMode = null;
      this.autoResource = null;
      this.state = { kind: 'idle' };
      return;
    }
    if (this.autoMode === 'build') {
      const next = this.deps.findNearestSite(this.sprite.x, this.sprite.y);
      if (next) {
        this.startMoveToSite(next);
        return;
      }
      this.autoMode = null;
      this.state = { kind: 'idle' };
      return;
    }
    this.state = { kind: 'idle' };
  }

  update(dtSec: number): void {
    if (this._selected) {
      this.ring.setPosition(this.sprite.x, this.sprite.y + 4);
    }
    this.sprite.setDepth(this.sprite.y);
    this.ring.setDepth(this.sprite.y - 1);
    // Drive the worker's animation by FSM state. Phaser ignores a play()
    // call for an already-playing anim, so this is cheap per-frame.
    const animKey = this.selectAnimKey();
    if (animKey) this.sprite.play(animKey, true);

    switch (this.state.kind) {
      case 'idle':
      case 'depositing':
      case 'tending':
        return;

      case 'moving-to-node':
      case 'moving-to-dropoff':
      case 'moving-to-site':
      case 'moving-to-farm':
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

      case 'building': {
        const site = this.state.site;
        if (site.isConstructed) {
          // Someone else finished it (or buildContribute did via dt overflow).
          site.activeBuilders = Math.max(0, site.activeBuilders - 1);
          this.chainAfterAssignment();
          return;
        }
        site.contributeBuild(dtSec);
        if (site.isConstructed) {
          site.activeBuilders = Math.max(0, site.activeBuilders - 1);
          this.chainAfterAssignment();
        }
        return;
      }
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
        this.chainAfterAssignment();
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
      if (this.inventoryResource && this.inventoryAmount > 0 && this.currentDropoff) {
        const accepted = this.deps.deposit(
          this.inventoryResource,
          this.inventoryAmount,
          this.currentDropoff,
        );
        this.inventoryAmount = Math.max(0, this.inventoryAmount - accepted);
        if (this.inventoryAmount === 0) this.inventoryResource = null;
      }
      this.currentDropoff = null;
      this.sprite.clearTint();

      if (this.pendingFarmAfterDeposit && this.inventoryAmount === 0) {
        const farm = this.pendingFarmAfterDeposit;
        this.pendingFarmAfterDeposit = null;
        this.pendingNodeAfterDeposit = null;
        this.startMoveToFarm(farm);
        return;
      }
      // Honour an explicit "go to this specific node" tap that we deferred
      // because the worker had wrong cargo.
      if (this.pendingNodeAfterDeposit && this.inventoryAmount === 0) {
        const target = this.pendingNodeAfterDeposit;
        this.pendingNodeAfterDeposit = null;
        if (target.isAvailable) {
          this.startMoveToNode(target);
          return;
        }
      }
      if (afterNode && afterNode.isAvailable && this.inventoryAmount === 0) {
        this.startMoveToNode(afterNode);
      } else {
        this.chainAfterAssignment();
      }
      return;
    }

    if (this.state.kind === 'moving-to-site') {
      const site = this.state.site;
      if (site.isConstructed || site.activeBuilders >= 3) {
        this.chainAfterAssignment();
        return;
      }
      site.activeBuilders += 1;
      this.state = { kind: 'building', site };
      return;
    }

    if (this.state.kind === 'moving-to-farm') {
      const farm = this.state.farm;
      farm.activeTenders += 1;
      this.state = { kind: 'tending', farm };
      return;
    }
  }

  // Send the worker home: drop any cargo at the Town Hall, then go idle
  // (instead of auto-chaining to another resource). Used by the worker
  // selection panel's "Send home" button.
  sendHome(): void {
    this.releaseBuildingSlot();
    this.autoMode = null;
    this.autoResource = null;
    this.pendingFarmAfterDeposit = null;
    this.pendingNodeAfterDeposit = null;
    if (this.inventoryAmount > 0) {
      this.startMoveToDropoff(null);
    } else {
      this.state = { kind: 'idle' };
      this.path = [];
    }
  }

  // Friendly status string for the worker selection panel.
  getStatusText(): string {
    switch (this.state.kind) {
      case 'idle':
        return 'Idle';
      case 'moving-to-node':
        return verbForResource(this.state.node.resource, 'going');
      case 'gathering':
        return verbForResource(this.state.node.resource, 'doing');
      case 'moving-to-dropoff':
        return 'Returning';
      case 'depositing':
        return 'Depositing';
      case 'moving-to-site':
        return `Going to build ${this.state.site.def.name}`;
      case 'building':
        return `Building ${this.state.site.def.name}`;
      case 'moving-to-farm':
        return 'Heading to farm';
      case 'tending':
        return 'Tending farm';
    }
  }

  private selectAnimKey(): string | null {
    switch (this.state.kind) {
      case 'idle':
      case 'depositing':
        return 'worker_idle';
      case 'moving-to-node':
      case 'moving-to-dropoff':
      case 'moving-to-site':
      case 'moving-to-farm':
        return 'worker_run';
      case 'gathering': {
        const r = this.state.node.resource;
        if (r === 'wood') return 'worker_chop';
        if (r === 'stone') return 'worker_mine';
        return 'worker_knife';
      }
      case 'building':
        return 'worker_build';
      case 'tending':
        return 'worker_knife';
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.ring.destroy();
  }
}

function verbForResource(r: ResourceType, mode: 'going' | 'doing'): string {
  if (mode === 'going') {
    return r === 'wood' ? 'Heading to chop' : r === 'stone' ? 'Heading to mine' : 'Heading to forage';
  }
  return r === 'wood' ? 'Chopping wood' : r === 'stone' ? 'Mining stone' : 'Gathering food';
}

function pathToWaypoints(path: TileXY[]): { x: number; y: number }[] {
  const waypoints: { x: number; y: number }[] = [];
  for (let i = 1; i < path.length; i++) {
    waypoints.push({
      x: path[i].tx * TILE_SIZE + TILE_SIZE / 2,
      y: path[i].ty * TILE_SIZE + TILE_SIZE / 2,
    });
  }
  return waypoints;
}

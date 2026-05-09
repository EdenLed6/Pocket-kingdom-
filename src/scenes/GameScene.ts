import Phaser from 'phaser';
import { TouchController } from '../input/TouchController';
import {
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  TILE,
  TILE_SIZE,
} from '../data/tiles';
import { BALANCE, NODE_TO_RESOURCE, type NodeKind, type ResourceType } from '../data/balance';
import { ResourceNode } from '../entities/ResourceNode';
import { Worker } from '../entities/Worker';
import type { TileXY } from '../utils/pathfinding';

interface MapJson {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  data: number[][];
}

const REGISTRY_KEY: Record<ResourceType, string> = {
  wood: 'wood',
  stone: 'stone',
  food: 'food',
};
const REGISTRY_CAP_KEY: Record<ResourceType, string> = {
  wood: 'woodCap',
  stone: 'stoneCap',
  food: 'foodCap',
};

export class GameScene extends Phaser.Scene {
  private mapData: number[][] = [];
  private nodes: ResourceNode[] = [];
  private workers: Worker[] = [];
  private selectedWorker: Worker | null = null;
  private touch!: TouchController;

  constructor() {
    super('Game');
  }

  create(): void {
    const json = this.cache.json.get('main_map') as MapJson | undefined;
    if (!json) throw new Error('main_map JSON not found in cache');
    this.mapData = json.data;

    const map = this.make.tilemap({
      data: json.data,
      tileWidth: json.tileWidth,
      tileHeight: json.tileHeight,
    });
    const tileset = map.addTilesetImage('terrain', 'terrain', TILE_SIZE, TILE_SIZE, 0, 0);
    if (!tileset) throw new Error('failed to bind terrain tileset');
    const layer = map.createLayer(0, tileset, 0, 0);
    if (!layer) throw new Error('failed to create tilemap layer');

    const worldW = MAP_WIDTH_TILES * TILE_SIZE;
    const worldH = MAP_HEIGHT_TILES * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    this.spawnTownHall();
    this.spawnNodes();
    this.spawnWorkers();

    const th = BALANCE.townHall;
    const thCenterX = (th.tileX + th.sizeTiles / 2) * TILE_SIZE;
    const thCenterY = (th.tileY + th.sizeTiles / 2) * TILE_SIZE;
    this.cameras.main.centerOn(thCenterX, thCenterY);

    this.touch = new TouchController(this, { minZoom: 0.7, maxZoom: 2.0 });

    // Initialise resource counters via the registry so UIScene can listen.
    const start = BALANCE.startingResources;
    const cap = BALANCE.storage.initialCap;
    this.registry.set(REGISTRY_KEY.wood, start.wood);
    this.registry.set(REGISTRY_KEY.stone, start.stone);
    this.registry.set(REGISTRY_KEY.food, start.food);
    this.registry.set(REGISTRY_CAP_KEY.wood, cap.wood);
    this.registry.set(REGISTRY_CAP_KEY.stone, cap.stone);
    this.registry.set(REGISTRY_CAP_KEY.food, cap.food);

    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    for (const w of this.workers) w.update(dt);
  }

  private spawnTownHall(): void {
    const th = BALANCE.townHall;
    const sizePx = th.sizeTiles * TILE_SIZE;
    const cx = th.tileX * TILE_SIZE + sizePx / 2;
    const cy = th.tileY * TILE_SIZE + sizePx / 2;
    this.add
      .sprite(cx, cy + sizePx / 2, 'town-hall')
      .setOrigin(0.5, 1)
      .setDepth(cy + sizePx / 2);
  }

  private spawnNodes(): void {
    // Reserve the area inside / immediately around the Town Hall so spawn
    // tiles and dropoff are clear of resource nodes.
    const occupied = new Set<number>();
    const th = BALANCE.townHall;
    for (let dy = -1; dy <= th.sizeTiles + 1; dy++) {
      for (let dx = -1; dx <= th.sizeTiles + 1; dx++) {
        occupied.add((th.tileY + dy) * 4096 + (th.tileX + dx));
      }
    }

    // Per §4.5 ratios (tuned down for Phase 3 readability of the placeholder
    // art): trees ~5%, rocks ~1.5%, bushes ~1%, animals ~0.4%.
    type Plan = { kind: NodeKind; chance: number };
    const plan: Plan[] = [
      { kind: 'tree', chance: 0.05 },
      { kind: 'rock', chance: 0.015 },
      { kind: 'bush', chance: 0.01 },
      { kind: 'animal', chance: 0.004 },
    ];
    const rng = Phaser.Math.RND;
    rng.sow(['phase-3-nodes']);

    for (let ty = 0; ty < MAP_HEIGHT_TILES; ty++) {
      for (let tx = 0; tx < MAP_WIDTH_TILES; tx++) {
        if (occupied.has(ty * 4096 + tx)) continue;
        if (this.mapData[ty][tx] !== TILE.GRASS) continue;
        const r = rng.frac();
        let acc = 0;
        for (const p of plan) {
          acc += p.chance;
          if (r < acc) {
            this.nodes.push(new ResourceNode(this, p.kind, tx, ty));
            occupied.add(ty * 4096 + tx);
            break;
          }
        }
      }
    }
  }

  private spawnWorkers(): void {
    const th = BALANCE.townHall;
    const spawnTiles: TileXY[] = [
      { tx: th.tileX, ty: th.tileY + th.sizeTiles },
      { tx: th.tileX + 1, ty: th.tileY + th.sizeTiles },
      { tx: th.tileX + 2, ty: th.tileY + th.sizeTiles },
    ];
    const deps = {
      mapWidthTiles: MAP_WIDTH_TILES,
      mapHeightTiles: MAP_HEIGHT_TILES,
      isWalkable: this.isWalkable.bind(this),
      getDropoffTile: this.getDropoffTile.bind(this),
      deposit: this.deposit.bind(this),
      findNearestNode: this.findNearestNode.bind(this),
    };
    for (let i = 0; i < BALANCE.startingWorkers; i++) {
      this.workers.push(new Worker(i, this, spawnTiles[i].tx, spawnTiles[i].ty, deps));
    }
  }

  private isWalkable(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= MAP_WIDTH_TILES || ty >= MAP_HEIGHT_TILES) return false;
    const t = this.mapData[ty][tx];
    if (t === TILE.WATER) return false;
    return true;
  }

  private getDropoffTile(): TileXY {
    const th = BALANCE.townHall;
    return { tx: th.tileX + 1, ty: th.tileY + th.sizeTiles };
  }

  private findNearestNode(fromX: number, fromY: number, resource: ResourceType): ResourceNode | null {
    let best: ResourceNode | null = null;
    let bestDistSq = Infinity;
    for (const n of this.nodes) {
      if (!n.isAvailable) continue;
      if (NODE_TO_RESOURCE[n.kind] !== resource) continue;
      const dx = n.worldX - fromX;
      const dy = n.worldY - fromY;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        best = n;
        bestDistSq = distSq;
      }
    }
    return best;
  }

  private deposit(resource: ResourceType, amount: number): number {
    const capKey = REGISTRY_CAP_KEY[resource];
    const valKey = REGISTRY_KEY[resource];
    const cap = (this.registry.get(capKey) as number) ?? 0;
    const cur = (this.registry.get(valKey) as number) ?? 0;
    const accepted = Math.min(amount, Math.max(0, cap - cur));
    this.registry.set(valKey, cur + accepted);
    return accepted;
  }

  private onPointerUp(pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]): void {
    if (this.touch.wasGesture) return;
    if (pointer.getDistance() > 10) return;

    const obj = currentlyOver.find(
      (o) => o.getData && (o.getData('kind') === 'worker' || o.getData('kind') === 'node'),
    );
    if (!obj) {
      this.deselect();
      return;
    }

    const kind = obj.getData('kind');
    if (kind === 'worker') {
      const w = obj.getData('worker') as Worker;
      if (this.selectedWorker === w) {
        this.deselect();
      } else {
        this.deselect();
        this.selectedWorker = w;
        w.setSelected(true);
      }
      return;
    }
    if (kind === 'node') {
      const node = obj.getData('node') as ResourceNode;
      if (this.selectedWorker) {
        this.selectedWorker.assignNode(node);
      }
      return;
    }
  }

  private deselect(): void {
    if (this.selectedWorker) {
      this.selectedWorker.setSelected(false);
      this.selectedWorker = null;
    }
  }
}

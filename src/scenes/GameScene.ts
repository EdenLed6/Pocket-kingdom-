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
import { Building } from '../entities/Building';
import { BUILDING_DEFS, type BuildingId } from '../data/buildings';
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

interface PlacementState {
  id: BuildingId;
  ghost: Phaser.GameObjects.Sprite;
  outline: Phaser.GameObjects.Rectangle;
}

export class GameScene extends Phaser.Scene {
  private mapData: number[][] = [];
  private nodes: ResourceNode[] = [];
  private workers: Worker[] = [];
  private buildings: Building[] = [];
  // Tile keys (`ty * 4096 + tx`) of every tile occupied by a building (site
  // or finished). Used by isWalkable + placement validation.
  private buildingTiles = new Set<number>();
  // Resource nodes register their tile too so placement doesn't put a
  // building on top of a tree, etc.
  private nodeTiles = new Set<number>();
  private selectedWorker: Worker | null = null;
  private placement: PlacementState | null = null;
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

    const start = BALANCE.startingResources;
    const cap = BALANCE.storage.initialCap;
    this.registry.set(REGISTRY_KEY.wood, start.wood);
    this.registry.set(REGISTRY_KEY.stone, start.stone);
    this.registry.set(REGISTRY_KEY.food, start.food);
    this.registry.set(REGISTRY_CAP_KEY.wood, cap.wood);
    this.registry.set(REGISTRY_CAP_KEY.stone, cap.stone);
    this.registry.set(REGISTRY_CAP_KEY.food, cap.food);
    // Tracks which buildings have ever been constructed, for prereq checks.
    this.registry.set('builtIds', new Set<BuildingId>(['town_hall' as BuildingId]));

    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    // UIScene's BUILD button emits this through the registry/scene events.
    const ui = this.scene.get('UI');
    ui.events.on('build-card-selected', this.onBuildCardSelected, this);
    ui.events.on('build-cancel', this.cancelPlacement, this);
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    for (const w of this.workers) w.update(dt);
  }

  // ---------- spawn helpers ---------------------------------------------------

  private spawnTownHall(): void {
    const th = BALANCE.townHall;
    const sizePx = th.sizeTiles * TILE_SIZE;
    const cx = th.tileX * TILE_SIZE + sizePx / 2;
    const cy = th.tileY * TILE_SIZE + sizePx / 2;
    this.add
      .sprite(cx, cy + sizePx / 2, 'town-hall')
      .setOrigin(0.5, 1)
      .setDepth(cy + sizePx / 2);
    // Mark the Town Hall footprint as building tiles.
    for (let dy = 0; dy < th.sizeTiles; dy++) {
      for (let dx = 0; dx < th.sizeTiles; dx++) {
        this.buildingTiles.add(this.tileKey(th.tileX + dx, th.tileY + dy));
      }
    }
  }

  private spawnNodes(): void {
    const th = BALANCE.townHall;
    const reserved = new Set<number>();
    for (let dy = -1; dy <= th.sizeTiles + 1; dy++) {
      for (let dx = -1; dx <= th.sizeTiles + 1; dx++) {
        reserved.add(this.tileKey(th.tileX + dx, th.tileY + dy));
      }
    }

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
        const k = this.tileKey(tx, ty);
        if (reserved.has(k)) continue;
        if (this.mapData[ty][tx] !== TILE.GRASS) continue;
        const r = rng.frac();
        let acc = 0;
        for (const p of plan) {
          acc += p.chance;
          if (r < acc) {
            this.nodes.push(new ResourceNode(this, p.kind, tx, ty));
            this.nodeTiles.add(k);
            reserved.add(k);
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
      findNearestSite: this.findNearestSite.bind(this),
    };
    for (let i = 0; i < BALANCE.startingWorkers; i++) {
      this.workers.push(new Worker(i, this, spawnTiles[i].tx, spawnTiles[i].ty, deps));
    }
  }

  // ---------- shared helpers --------------------------------------------------

  private tileKey(tx: number, ty: number): number {
    return ty * 4096 + tx;
  }

  private isWalkable(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= MAP_WIDTH_TILES || ty >= MAP_HEIGHT_TILES) return false;
    if (this.mapData[ty][tx] === TILE.WATER) return false;
    if (this.buildingTiles.has(this.tileKey(tx, ty))) return false;
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

  private findNearestSite(fromX: number, fromY: number): Building | null {
    let best: Building | null = null;
    let bestDistSq = Infinity;
    for (const b of this.buildings) {
      if (b.isConstructed) continue;
      if (b.activeBuilders >= 3) continue;
      const dx = b.worldX - fromX;
      const dy = b.worldY - fromY;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        best = b;
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

  // ---------- placement -------------------------------------------------------

  private onBuildCardSelected(id: BuildingId): void {
    if (!this.canAfford(id)) return;
    this.cancelPlacement();
    const def = BUILDING_DEFS[id];
    const ghost = this.add
      .sprite(0, 0, `b_${id}`)
      .setOrigin(0.5, 1)
      .setAlpha(0.6)
      .setDepth(10000)
      .setVisible(false);
    const outline = this.add
      .rectangle(
        0,
        0,
        def.footprint.w * TILE_SIZE,
        def.footprint.h * TILE_SIZE,
        0x80ff80,
        0.25,
      )
      .setOrigin(0, 0)
      .setDepth(9999)
      .setStrokeStyle(2, 0x80ff80)
      .setVisible(false);
    this.placement = { id, ghost, outline };
  }

  private cancelPlacement(): void {
    if (!this.placement) return;
    this.placement.ghost.destroy();
    this.placement.outline.destroy();
    this.placement = null;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.placement) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const def = BUILDING_DEFS[this.placement.id];
    const tx = Math.floor(world.x / TILE_SIZE) - Math.floor(def.footprint.w / 2);
    const ty = Math.floor(world.y / TILE_SIZE) - Math.floor(def.footprint.h / 2);
    const ok = this.isPlacementValid(this.placement.id, tx, ty);
    const ghost = this.placement.ghost;
    const outline = this.placement.outline;
    ghost
      .setVisible(true)
      .setPosition((tx + def.footprint.w / 2) * TILE_SIZE, (ty + def.footprint.h) * TILE_SIZE)
      .setTint(ok ? 0x80ff80 : 0xff8080);
    outline
      .setVisible(true)
      .setPosition(tx * TILE_SIZE, ty * TILE_SIZE)
      .setFillStyle(ok ? 0x80ff80 : 0xff8080, 0.2)
      .setStrokeStyle(2, ok ? 0x80ff80 : 0xff8080);
  }

  private isPlacementValid(id: BuildingId, tx: number, ty: number): boolean {
    const def = BUILDING_DEFS[id];
    if (tx < 0 || ty < 0) return false;
    if (tx + def.footprint.w > MAP_WIDTH_TILES) return false;
    if (ty + def.footprint.h > MAP_HEIGHT_TILES) return false;
    for (let dy = 0; dy < def.footprint.h; dy++) {
      for (let dx = 0; dx < def.footprint.w; dx++) {
        const cx = tx + dx;
        const cy = ty + dy;
        if (this.mapData[cy][cx] === TILE.WATER) return false;
        const k = this.tileKey(cx, cy);
        if (this.buildingTiles.has(k)) return false;
        if (this.nodeTiles.has(k)) return false;
      }
    }
    if (!this.prereqsMet(id)) return false;
    return true;
  }

  private prereqsMet(id: BuildingId): boolean {
    const def = BUILDING_DEFS[id];
    const built = this.registry.get('builtIds') as Set<BuildingId>;
    if (def.prereqs && !def.prereqs.every((p) => built.has(p))) return false;
    if (def.prereqsAny && !def.prereqsAny.some((p) => built.has(p))) return false;
    return true;
  }

  private canAfford(id: BuildingId): boolean {
    const def = BUILDING_DEFS[id];
    for (const [k, v] of Object.entries(def.cost) as [ResourceType, number][]) {
      if (((this.registry.get(REGISTRY_KEY[k]) as number) ?? 0) < v) return false;
    }
    return true;
  }

  private placeBuilding(id: BuildingId, tx: number, ty: number): void {
    const def = BUILDING_DEFS[id];
    // Deduct cost.
    for (const [k, v] of Object.entries(def.cost) as [ResourceType, number][]) {
      const cur = (this.registry.get(REGISTRY_KEY[k]) as number) ?? 0;
      this.registry.set(REGISTRY_KEY[k], cur - v);
    }
    const b = new Building(this, id, tx, ty);
    this.buildings.push(b);
    for (const t of b.footprintTiles()) {
      this.buildingTiles.add(this.tileKey(t.tx, t.ty));
    }
    // Auto-assign currently-idle workers to the new site (cap at 3).
    let recruited = 0;
    for (const w of this.workers) {
      if (recruited >= 3) break;
      w.assignSite(b);
      recruited += 1;
    }
    this.events.once('building-constructed', () => {
      // Fired by Building.completeConstruction. Mark id as built so prereqs
      // resolve. We listen each placement so we don't keep stale handlers.
    });
    this.events.on('building-constructed', this.onBuildingConstructed, this);
  }

  private onBuildingConstructed(b: Building): void {
    const built = this.registry.get('builtIds') as Set<BuildingId>;
    built.add(b.def.id);
    // Touch the registry key so listeners (if any) fire.
    this.registry.set('builtIds', built);
  }

  // ---------- input -----------------------------------------------------------

  private onPointerUp(pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]): void {
    if (this.touch.wasGesture) return;
    if (pointer.getDistance() > 10) return;

    if (this.placement) {
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const def = BUILDING_DEFS[this.placement.id];
      const tx = Math.floor(world.x / TILE_SIZE) - Math.floor(def.footprint.w / 2);
      const ty = Math.floor(world.y / TILE_SIZE) - Math.floor(def.footprint.h / 2);
      if (this.isPlacementValid(this.placement.id, tx, ty) && this.canAfford(this.placement.id)) {
        this.placeBuilding(this.placement.id, tx, ty);
        this.cancelPlacement();
      }
      return;
    }

    const obj = currentlyOver.find((o) => {
      if (!o.getData) return false;
      const k = o.getData('kind');
      return k === 'worker' || k === 'node' || k === 'building';
    });
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
      if (this.selectedWorker) this.selectedWorker.assignNode(node);
      return;
    }
    if (kind === 'building') {
      const b = obj.getData('building') as Building;
      if (this.selectedWorker && !b.isConstructed) {
        this.selectedWorker.assignSite(b);
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

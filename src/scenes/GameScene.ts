import Phaser from 'phaser';
import { TouchController } from '../input/TouchController';
import {
  LAKES,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  TILE,
  TILE_SIZE,
} from '../data/tiles';
import { BALANCE, NODE_TO_RESOURCE, type NodeKind, type ResourceType } from '../data/balance';
import { ResourceNode } from '../entities/ResourceNode';
import { Worker } from '../entities/Worker';
import { Building } from '../entities/Building';
import { Unit } from '../entities/Unit';
import { PowerSystem } from '../systems/PowerSystem';
import { RaidSystem, type BanditId } from '../systems/RaidSystem';
import {
  SaveSystem,
  SAVE_VERSION,
  type SaveData,
  type SavedTile,
} from '../systems/SaveSystem';
import { BUILDING_DEFS, type BuildingId } from '../data/buildings';
import { UNIT_DEFS, type UnitId } from '../data/units';
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
  private units: Unit[] = [];
  private selectedSoldier: Unit | null = null;
  private selectedBarracks: Building | null = null;
  // Tile keys (`ty * 4096 + tx`) of every tile occupied by a building (site
  // or finished). Used by isWalkable + placement validation.
  private buildingTiles = new Set<number>();
  // Resource nodes register their tile too so placement doesn't put a
  // building on top of a tree, etc.
  private nodeTiles = new Set<number>();
  private selectedWorker: Worker | null = null;
  private placement: PlacementState | null = null;
  private touch!: TouchController;
  // Road / decoration paint mode (P5). When on, taps + drags repaint
  // grass <-> dirt-path tiles. Exclusive: no other tap dispatch fires.
  // Paint mode: 'off' = normal play, 'road' = paint grass<->dirt path,
  // 'water' = paint grass<->water (Eden's "dig channels" request).
  private paintMode: 'off' | 'road' | 'water' = 'off';
  private painting = false;
  private tilemapLayer!: Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer;
  // Single Graphics layer that paints every WATER tile in mapData
  // (lakes + dug channels). Redrawn whenever mapData water changes.
  private waterGraphics!: Phaser.GameObjects.Graphics;
  private lakePolygons: Phaser.Math.Vector2[][] = [];

  constructor() {
    super('Game');
  }

  create(): void {
    const json = this.cache.json.get('main_map') as MapJson | undefined;
    if (!json) throw new Error('main_map JSON not found in cache');
    this.mapData = json.data;

    // JSON has 32 baked in but our world now uses TILE_SIZE = 64 (Tiny
    // Swords native scale). Override here so the layer renders at world
    // coordinates that match every other position calc.
    const map = this.make.tilemap({
      data: json.data,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });
    const tileset = map.addTilesetImage('terrain', 'terrain', TILE_SIZE, TILE_SIZE, 0, 0);
    if (!tileset) throw new Error('failed to bind terrain tileset');
    const layer = map.createLayer(0, tileset, 0, 0);
    if (!layer) throw new Error('failed to create tilemap layer');
    this.tilemapLayer = layer;

    const worldW = MAP_WIDTH_TILES * TILE_SIZE;
    const worldH = MAP_HEIGHT_TILES * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    // mapData starts all-grass (regenerated). Mark every tile that falls
    // inside a lake polygon as WATER, then render water + future painted
    // channels via a single Graphics layer. Pathfinding uses mapData.
    this.waterGraphics = this.add.graphics().setDepth(2);
    this.markLakeWater();
    this.redrawWater();

    const th = BALANCE.townHall;
    const thCenterX = (th.tileX + th.sizeTiles / 2) * TILE_SIZE;
    const thCenterY = (th.tileY + th.sizeTiles / 2) * TILE_SIZE;
    this.cameras.main.centerOn(thCenterX, thCenterY);

    this.touch = new TouchController(this, { minZoom: 0.7, maxZoom: 2.0 });

    // §6.7: auto-load if a compatible save exists; otherwise fresh spawn.
    // Player wipes via Settings → Reset Progress.
    const snap = SaveSystem.load();
    if (snap) {
      console.log('[SaveSystem] restoring from save');
      this.applySnapshot(snap);
    } else {
      this.spawnFresh();
    }

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    // UIScene's BUILD button emits this through the registry/scene events.
    const ui = this.scene.get('UI');
    ui.events.on('build-card-selected', this.onBuildCardSelected, this);
    ui.events.on('build-cancel', this.cancelPlacement, this);
    ui.events.on('train-unit', this.onTrainUnitRequest, this);
    ui.events.on('train-worker', this.onTrainWorkerRequest, this);
    ui.events.on('road-toggle', this.toggleRoadMode, this);
    ui.events.on('save-now', () => SaveSystem.save(this.buildSnapshot()));
    ui.events.on('load-game', () => {
      // Save is already in localStorage; reload picks it up via auto-load.
      window.location.reload();
    });
    ui.events.on('reset-progress', () => {
      SaveSystem.clear();
      window.location.reload();
    });
    // Register once; per-placement handlers leaked in the 3b draft.
    this.events.on('building-constructed', this.onBuildingConstructed, this);

    // §6.6: PowerSystem recomputes P_player every 5s and writes it to
    // registry 'pPlayer'. RaidSystem (5b) reads from there. The system
    // self-cleans on scene shutdown; no scene-level reference needed.
    new PowerSystem(this, {
      workers: () => this.workers,
      playerUnits: () => this.units.filter((u) => u.side === 'player'),
      buildings: () => this.buildings,
      resourceTotal: () =>
        ((this.registry.get('wood') as number) ?? 0) +
        ((this.registry.get('stone') as number) ?? 0) +
        ((this.registry.get('food') as number) ?? 0),
    });
    this.events.on('unit-died', this.onUnitDied, this);
    this.events.on('building-destroyed', this.onBuildingDestroyed, this);

    // §6.5: RaidSystem schedules + spawns enemy waves. Replaces the
    // Phase 4 stationary dummy bandits. Bandits spawn at a random map
    // edge and get attack-move'd toward the Town Hall on creation.
    new RaidSystem(this, {
      spawnBandit: (id, tx, ty) => this.spawnBandit(id, tx, ty),
      elapsedSec: () => this.time.now / 1000,
    });

    // §6.7: auto-save every 30s. Boot's auto-load picks it up next time.
    this.startAutoSave();
  }

  private spawnBandit(id: BanditId, tx: number, ty: number): void {
    const u = new Unit(this, id, tx, ty, this.unitDeps());
    this.units.push(u);
    // Send the bandit toward the Town Hall. Unit's attack-move stance
    // makes it auto-engage any worker / soldier in range along the way.
    const th = BALANCE.townHall;
    u.attackMove({ tx: th.tileX + 1, ty: th.tileY + th.sizeTiles });
  }


  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    for (const w of this.workers) w.update(dt);
    for (const u of this.units) if (u.isAlive) u.update(dt);
    this.tickTowers(dt);
  }

  // Per-tower cooldown so multiple towers fire independently. Keyed by
  // Building.instanceId.
  private towerCooldown = new Map<number, number>();

  // §4.4 tower: auto-attack the nearest enemy unit within 5 tiles, 15
  // damage every 2 seconds. Pure scene-side combat — no Building-side
  // logic so towers stay decoupled from unit deps.
  private tickTowers(dt: number): void {
    for (const b of this.buildings) {
      if (b.def.id !== 'tower' || !b.isConstructed) continue;
      const cd = (this.towerCooldown.get(b.instanceId) ?? 0) - dt;
      if (cd > 0) {
        this.towerCooldown.set(b.instanceId, cd);
        continue;
      }
      const enemy = this.findEnemy('player', b.worldX, b.worldY, 5);
      if (!enemy) {
        this.towerCooldown.set(b.instanceId, 0);
        continue;
      }
      enemy.takeDamage(15);
      this.towerCooldown.set(b.instanceId, 2);
      this.drawTowerFlash(b.worldX, b.worldY, enemy.worldX, enemy.worldY);
    }
  }

  private drawTowerFlash(x1: number, y1: number, x2: number, y2: number): void {
    const g = this.add.graphics().setDepth(Math.max(y1, y2) + 5);
    g.lineStyle(3, 0xffd060, 1);
    g.lineBetween(x1, y1 - 18, x2, y2 - 6);
    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 220,
      onComplete: () => g.destroy(),
    });
  }

  private unitDeps() {
    return {
      mapWidthTiles: MAP_WIDTH_TILES,
      mapHeightTiles: MAP_HEIGHT_TILES,
      isWalkable: this.isWalkable.bind(this),
      findEnemy: this.findEnemy.bind(this),
      findEnemyBuilding: this.findEnemyBuilding.bind(this),
    };
  }

  // Returns the closest constructed enemy building within range, or null.
  // All buildings in this game are player-side, so for forSide='player'
  // (player units looking for buildings) we always return null. Bandits
  // (forSide='enemy') get the nearest standing player building.
  private findEnemyBuilding(
    forSide: 'player' | 'enemy',
    x: number,
    y: number,
    withinTiles: number,
  ): Building | null {
    if (forSide !== 'enemy') return null;
    const limit = (withinTiles * TILE_SIZE) ** 2;
    let best: Building | null = null;
    let bestDistSq = Infinity;
    for (const b of this.buildings) {
      if (!b.isConstructed) continue;
      const dx = b.worldX - x;
      const dy = b.worldY - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > limit) continue;
      if (d2 < bestDistSq) {
        best = b;
        bestDistSq = d2;
      }
    }
    return best;
  }

  private findEnemy(forSide: 'player' | 'enemy', x: number, y: number, withinTiles: number): Unit | null {
    const limit = (withinTiles * TILE_SIZE) ** 2;
    let best: Unit | null = null;
    let bestDistSq = Infinity;
    for (const u of this.units) {
      if (!u.isAlive) continue;
      if (u.side === forSide) continue;
      const dx = u.worldX - x;
      const dy = u.worldY - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > limit) continue;
      if (d2 < bestDistSq) {
        best = u;
        bestDistSq = d2;
      }
    }
    return best;
  }

  private onUnitDied(u: Unit): void {
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
    if (this.selectedSoldier === u) this.selectedSoldier = null;
  }

  private onBuildingDestroyed(b: Building): void {
    const i = this.buildings.indexOf(b);
    if (i >= 0) this.buildings.splice(i, 1);
    // Free the tiles for re-use (rebuilds, road painting).
    for (const t of b.footprintTiles()) {
      this.buildingTiles.delete(this.tileKey(t.tx, t.ty));
    }
    if (this.selectedBarracks === b) {
      this.selectedBarracks = null;
      this.scene.get('UI').events.emit('close-building-panel');
    }
    // Town Hall destroyed = game over.
    if (b.def.id === 'town_hall') {
      console.log('[GAME OVER] Town Hall destroyed.');
      this.scene.get('UI').events.emit('game-over');
      this.scene.pause();
    }
  }

  // §4.3: Town Hall trains workers. Cost 30 food + 20 wood, 10s.
  private onTrainWorkerRequest(): void {
    const cost = BALANCE.workerTrain.cost;
    const wood = (this.registry.get(REGISTRY_KEY.wood) as number) ?? 0;
    const food = (this.registry.get(REGISTRY_KEY.food) as number) ?? 0;
    if ((cost.wood ?? 0) > wood) return;
    if ((cost.food ?? 0) > food) return;
    const pop = (this.registry.get('pop') as number) ?? 0;
    const popCap = (this.registry.get('popCap') as number) ?? 0;
    if (pop >= popCap) return;
    this.registry.set(REGISTRY_KEY.wood, wood - (cost.wood ?? 0));
    this.registry.set(REGISTRY_KEY.food, food - (cost.food ?? 0));
    this.registry.set('pop', pop + 1);
    this.time.delayedCall(BALANCE.workerTrain.trainTimeSec * 1000, () => {
      const th = BALANCE.townHall;
      const t = { tx: th.tileX + 1, ty: th.tileY + th.sizeTiles };
      const w = new Worker(this.workers.length, this, t.tx, t.ty, {
        mapWidthTiles: MAP_WIDTH_TILES,
        mapHeightTiles: MAP_HEIGHT_TILES,
        isWalkable: this.isWalkable.bind(this),
        getDropoffTile: this.getDropoffTile.bind(this),
        deposit: this.deposit.bind(this),
        findNearestNode: this.findNearestNode.bind(this),
        findNearestSite: this.findNearestSite.bind(this),
        isBanditNearby: this.isBanditNearby.bind(this),
        getHomeTile: this.getHomeTile.bind(this),
      });
      this.workers.push(w);
    });
  }

  // Player tapped a Train button on the Barracks selection panel.
  private onTrainUnitRequest(payload: { id: UnitId; barracksId: number }): void {
    const def = UNIT_DEFS[payload.id];
    if (!def.cost || !def.trainTimeSec) return;
    const barracks = this.buildings.find(
      (b) => b.instanceId === payload.barracksId && b.def.id === 'barracks' && b.isConstructed,
    );
    if (!barracks) return;
    // Affordability.
    for (const [k, v] of Object.entries(def.cost) as [ResourceType, number][]) {
      if (((this.registry.get(REGISTRY_KEY[k]) as number) ?? 0) < v) return;
    }
    // Pop cap.
    const pop = (this.registry.get('pop') as number) ?? 0;
    const popCap = (this.registry.get('popCap') as number) ?? 0;
    if (pop >= popCap) return;
    // Deduct + bump pop.
    for (const [k, v] of Object.entries(def.cost) as [ResourceType, number][]) {
      const cur = (this.registry.get(REGISTRY_KEY[k]) as number) ?? 0;
      this.registry.set(REGISTRY_KEY[k], cur - v);
    }
    this.registry.set('pop', pop + 1);
    // Train timer; spawn at the south-centre tile of the barracks footprint.
    this.time.delayedCall(def.trainTimeSec * 1000, () => {
      const t = barracks.interactionTile;
      const u = new Unit(this, payload.id, t.tx, t.ty, this.unitDeps());
      this.units.push(u);
    });
  }

  // ---------- spawn helpers ---------------------------------------------------

  private spawnTownHall(): void {
    const th = BALANCE.townHall;
    // Town Hall is just a pre-built Building. This unifies tap dispatch +
    // selection panel handling across every building type, including TH.
    const b = new Building(this, 'town_hall', th.tileX, th.tileY);
    b.markPrebuilt();
    this.buildings.push(b);
    for (const t of b.footprintTiles()) {
      this.buildingTiles.add(this.tileKey(t.tx, t.ty));
    }
  }

  // Generate jittered polygons for every LAKE config (deterministic seed).
  // Used by both markLakeWater (sets mapData.WATER for tiles inside) and
  // redrawWater (the visible Graphics layer also draws inside the same
  // shape) so what's painted matches what blocks pathfinding.
  private buildLakePolygons(): void {
    let seed = 7;
    const next = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const N = 28;
    this.lakePolygons = [];
    for (const lake of LAKES) {
      const cx = (lake.cx + 0.5) * TILE_SIZE;
      const cy = (lake.cy + 0.5) * TILE_SIZE;
      const rx = lake.rx * TILE_SIZE;
      const ry = lake.ry * TILE_SIZE;
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const j = 1.0 + next() * 0.22; // 1.00-1.22 organic shoreline
        pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j));
      }
      this.lakePolygons.push(pts);
    }
  }

  // Mark mapData[ty][tx] = WATER for every tile whose centre falls inside
  // any lake polygon. Done once at boot so spawnNodes / pathfinding /
  // placement all see the lakes correctly.
  private markLakeWater(): void {
    this.buildLakePolygons();
    for (const polygon of this.lakePolygons) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of polygon) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const txMin = Math.max(0, Math.floor(minX / TILE_SIZE));
      const txMax = Math.min(MAP_WIDTH_TILES - 1, Math.ceil(maxX / TILE_SIZE));
      const tyMin = Math.max(0, Math.floor(minY / TILE_SIZE));
      const tyMax = Math.min(MAP_HEIGHT_TILES - 1, Math.ceil(maxY / TILE_SIZE));
      for (let ty = tyMin; ty <= tyMax; ty++) {
        for (let tx = txMin; tx <= txMax; tx++) {
          const cx = (tx + 0.5) * TILE_SIZE;
          const cy = (ty + 0.5) * TILE_SIZE;
          if (this.pointInPolygon(cx, cy, polygon)) {
            this.mapData[ty][tx] = TILE.WATER;
          }
        }
      }
    }
  }

  private pointInPolygon(x: number, y: number, polygon: Phaser.Math.Vector2[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Render water in two paths so neither has the per-tile pattern Eden
  // saw before:
  //   Lakes (predefined LAKES) → smooth polygon (28-vertex jittered
  //                              ellipse). One filled shape, no scallops.
  //   Painted channels (TILE.WATER not inside any lake polygon) →
  //                              overlapping circle per tile (still gives
  //                              decent results for thin dug channels).
  // No per-tile sparkles — those formed a diamond grid pattern inside
  // the lake. Subtle organic wave hints replace them.
  private redrawWater(): void {
    const g = this.waterGraphics;
    g.clear();
    if (this.lakePolygons.length === 0 && this.channelTiles().length === 0) return;

    // ---- Lakes (smooth polygons) ----
    for (const polygon of this.lakePolygons) {
      // Outer rim (darker) by drawing the polygon at full size.
      g.fillStyle(0x2a73a8, 1);
      g.fillPoints(polygon, true);
      // Body — slightly inset polygon (computed by pulling each vertex
      // toward the polygon centroid).
      const inset = this.insetPolygon(polygon, 8);
      g.fillStyle(0x4a93cc, 1);
      g.fillPoints(inset, true);
      // Highlight — even more inset.
      const inner = this.insetPolygon(polygon, 18);
      g.fillStyle(0x65a8d8, 1);
      g.fillPoints(inner, true);
      // Light wave streaks scattered organically inside (not tile-aligned).
      this.drawWaveStreaks(polygon);
    }

    // ---- Painted channels ----
    const channels = this.channelTiles();
    if (channels.length > 0) {
      g.fillStyle(0x2a73a8, 1);
      for (const t of channels) g.fillCircle(t.cx, t.cy, TILE_SIZE * 0.78);
      g.fillStyle(0x4a93cc, 1);
      for (const t of channels) g.fillCircle(t.cx, t.cy, TILE_SIZE * 0.62);
      g.fillStyle(0x65a8d8, 1);
      for (const t of channels) g.fillCircle(t.cx, t.cy, TILE_SIZE * 0.46);
    }
  }

  // Tiles that are WATER in mapData but NOT inside any lake polygon.
  // Those are the player-painted channels.
  private channelTiles(): { cx: number; cy: number }[] {
    const out: { cx: number; cy: number }[] = [];
    for (let ty = 0; ty < MAP_HEIGHT_TILES; ty++) {
      for (let tx = 0; tx < MAP_WIDTH_TILES; tx++) {
        if (this.mapData[ty][tx] !== TILE.WATER) continue;
        const cx = (tx + 0.5) * TILE_SIZE;
        const cy = (ty + 0.5) * TILE_SIZE;
        let inLake = false;
        for (const poly of this.lakePolygons) {
          if (this.pointInPolygon(cx, cy, poly)) {
            inLake = true;
            break;
          }
        }
        if (!inLake) out.push({ cx, cy });
      }
    }
    return out;
  }

  private insetPolygon(polygon: Phaser.Math.Vector2[], px: number): Phaser.Math.Vector2[] {
    // Centroid-based inset: pull each vertex toward the polygon centre by
    // `px` pixels. Cheap and good enough for our ~ellipse-shaped lakes.
    let cx = 0, cy = 0;
    for (const p of polygon) {
      cx += p.x;
      cy += p.y;
    }
    cx /= polygon.length;
    cy /= polygon.length;
    return polygon.map((p) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.max(0, len - px) / len;
      return new Phaser.Math.Vector2(cx + dx * k, cy + dy * k);
    });
  }

  // Scatter a few small horizontal wavelets inside the lake polygon. Uses
  // a seeded RNG so the lake looks the same every load. Sparse — no grid.
  private drawWaveStreaks(polygon: Phaser.Math.Vector2[]): void {
    const g = this.waterGraphics;
    let cx = 0, cy = 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of polygon) {
      cx += p.x;
      cy += p.y;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    cx /= polygon.length;
    cy /= polygon.length;
    let seed = Math.floor(cx * 13 + cy * 31);
    const next = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const tries = 60;
    let placed = 0;
    g.fillStyle(0xc0e0f0, 0.7);
    for (let i = 0; i < tries && placed < 18; i++) {
      const px = minX + next() * (maxX - minX);
      const py = minY + next() * (maxY - minY);
      // Only inside the polygon and not too close to the rim.
      if (!this.pointInPolygon(px, py, polygon)) continue;
      // Must be at least 16 px from polygon edge (rough check via inset).
      const inset = this.insetPolygon(polygon, 14);
      if (!this.pointInPolygon(px, py, inset)) continue;
      const w = 6 + next() * 10;
      g.fillRect(px - w / 2, py, w, 1);
      placed++;
    }
  }

  // AoM-style biome placement: dense forests + rock clusters + berry
  // patches + small deer herds, instead of uniform scatter. Result: most
  // of the map is open grass for the player to build on, while resources
  // are concentrated in recognisable clumps.
  private spawnNodes(): void {
    const th = BALANCE.townHall;
    const reserved = new Set<number>();
    // Buffer the Town Hall area so resources don't crowd the spawn.
    for (let dy = -3; dy <= th.sizeTiles + 3; dy++) {
      for (let dx = -3; dx <= th.sizeTiles + 3; dx++) {
        reserved.add(this.tileKey(th.tileX + dx, th.tileY + dy));
      }
    }

    const rng = Phaser.Math.RND;
    rng.sow(['phase-4-clusters-v2']);

    // Forests: 6 dense forest blobs. Per-tile probabilistic placement
    // (instead of random scatter, which left visible "row" patterns and
    // sparse clumps). Density falls smoothly from centre to edge so the
    // silhouette reads as a real forest, not a circle of trees.
    for (let f = 0; f < 5; f++) {
      const cx = rng.between(4, MAP_WIDTH_TILES - 5);
      const cy = rng.between(4, MAP_HEIGHT_TILES - 5);
      this.fillForest(rng, cx, cy, /*radius*/ rng.between(2, 4), reserved);
    }

    // Rock cluster quarries: 4 blobs of ~8 rocks each.
    for (let r = 0; r < 4; r++) {
      const cx = rng.between(2, MAP_WIDTH_TILES - 3);
      const cy = rng.between(2, MAP_HEIGHT_TILES - 3);
      this.fillBlob(rng, 'rock', cx, cy, 2.5, rng.between(6, 10), reserved);
    }

    // Berry patches: 6 small clumps.
    for (let b = 0; b < 6; b++) {
      const cx = rng.between(2, MAP_WIDTH_TILES - 3);
      const cy = rng.between(2, MAP_HEIGHT_TILES - 3);
      this.fillBlob(rng, 'bush', cx, cy, 2, rng.between(4, 7), reserved);
    }

    // Sheep herds: 4 small grazing groups.
    for (let d = 0; d < 4; d++) {
      const cx = rng.between(2, MAP_WIDTH_TILES - 3);
      const cy = rng.between(2, MAP_HEIGHT_TILES - 3);
      this.fillBlob(rng, 'animal', cx, cy, 2, rng.between(2, 4), reserved);
    }
  }

  // Sub-tile forest scattering. Each forest spawns N trees at random
  // pixel positions inside a circle (radius in tiles). Density falls
  // smoothly with distance from the centre. Multiple trees per tile is
  // allowed — adjacent trees no longer share centres on the tile grid,
  // so the row/column pattern Eden was seeing dissolves.
  private fillForest(
    rng: Phaser.Math.RandomDataGenerator,
    cx: number,
    cy: number,
    radius: number,
    reserved: Set<number>,
  ): void {
    // Moderate density (≈ 1.5 trees per tile). 2.5 still felt cramped to
    // Eden. The variety knobs (4 tree variants, ±0.07 scale, random
    // horizontal flip, sub-tile positions) hide the row pattern without
    // needing absurd density.
    const target = Math.floor(radius * radius * Math.PI * 1.5);
    let placed = 0;
    let attempts = 0;
    while (placed < target && attempts < target * 4) {
      attempts++;
      // Mostly uniform-in-disk (sqrt), with a tiny center bias so the
      // middle is a touch denser. Plus per-attempt radius jitter to break
      // the circular boundary.
      const rNorm = Math.pow(rng.frac(), 0.6);
      const radiusJitter = 0.85 + rng.frac() * 0.3;
      const r = rNorm * radius * radiusJitter;
      const a = rng.frac() * Math.PI * 2;
      const wx = (cx + Math.cos(a) * r) * TILE_SIZE + TILE_SIZE / 2;
      const wy = (cy + Math.sin(a) * r) * TILE_SIZE + TILE_SIZE / 2;
      if (this.tryPlaceWorld('tree', wx, wy, reserved)) placed++;
    }
  }

  // Smaller-scale blob for rocks / bushes / sheep. Same idea: scatter at
  // random sub-tile positions. `count` is the target (uniform random
  // distribution over the disk).
  private fillBlob(
    rng: Phaser.Math.RandomDataGenerator,
    kind: NodeKind,
    cx: number,
    cy: number,
    radius: number,
    count: number,
    reserved: Set<number>,
  ): void {
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 4) {
      attempts++;
      const r = Math.sqrt(rng.frac()) * radius;
      const a = rng.frac() * Math.PI * 2;
      const wx = (cx + Math.cos(a) * r) * TILE_SIZE + TILE_SIZE / 2;
      const wy = (cy + Math.sin(a) * r) * TILE_SIZE + TILE_SIZE / 2;
      if (this.tryPlaceWorld(kind, wx, wy, reserved)) placed++;
    }
  }

  // Place a node at an arbitrary world pixel position. Validates the
  // owning tile (not water, not water-adjacent, not reserved by the
  // Town Hall buffer) but allows multiple nodes on the same tile so
  // forests can be densely packed without grid alignment.
  private tryPlaceWorld(
    kind: NodeKind,
    worldX: number,
    worldY: number,
    reserved: Set<number>,
  ): boolean {
    const tx = Math.floor(worldX / TILE_SIZE);
    const ty = Math.floor(worldY / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= MAP_WIDTH_TILES || ty >= MAP_HEIGHT_TILES) return false;
    if (reserved.has(this.tileKey(tx, ty))) return false;
    if (this.mapData[ty][tx] !== TILE.GRASS) return false;
    // Sprite-extent buffer: the visual reaches beyond the anchor tile, so
    // we must check more than the anchor itself for water.
    //   trees: scale ~0.45-0.52 on a 192×256 source, origin (0.5, 0.95).
    //          Canopy extends ~2 tiles UP and ~1 tile sideways → check a
    //          3×4 box (dx -1..1, dy -2..1).
    //   others: smaller; 4-neighbor (N/S/E/W) is enough.
    const dyMin = kind === 'tree' ? -2 : -1;
    const dyMax = kind === 'tree' ? 1 : 1;
    const dxMin = kind === 'tree' ? -1 : -1;
    const dxMax = kind === 'tree' ? 1 : 1;
    for (let dy = dyMin; dy <= dyMax; dy++) {
      for (let dx = dxMin; dx <= dxMax; dx++) {
        if (dx === 0 && dy === 0) continue;
        // For non-trees, only check 4-neighbours (skip diagonals) to keep
        // the previous behaviour for small sprites.
        if (kind !== 'tree' && dx !== 0 && dy !== 0) continue;
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_WIDTH_TILES || ny >= MAP_HEIGHT_TILES) continue;
        if (this.mapData[ny][nx] === TILE.WATER) return false;
      }
    }
    // Trees may stack with other trees (dense forests); but rocks /
    // bushes / sheep can't share a tile with anything already placed.
    // Spawn order is forests → rocks → bushes → sheep, so this stops a
    // rock cluster from landing in the middle of an existing forest.
    const tileK = this.tileKey(tx, ty);
    if (kind !== 'tree' && this.nodeTiles.has(tileK)) return false;
    this.nodes.push(new ResourceNode(this, kind, worldX, worldY));
    this.nodeTiles.add(tileK);
    return true;
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
      isBanditNearby: this.isBanditNearby.bind(this),
      getHomeTile: this.getHomeTile.bind(this),
    };
    for (let i = 0; i < BALANCE.startingWorkers; i++) {
      this.workers.push(new Worker(i, this, spawnTiles[i].tx, spawnTiles[i].ty, deps));
    }
  }

  // ---------- fresh spawn vs snapshot restore (§6.7) ------------------------

  private spawnFresh(): void {
    this.spawnTownHall();
    this.spawnNodes();
    this.spawnWorkers();

    const start = BALANCE.startingResources;
    const cap = BALANCE.storage.initialCap;
    this.registry.set(REGISTRY_KEY.wood, start.wood);
    this.registry.set(REGISTRY_KEY.stone, start.stone);
    this.registry.set(REGISTRY_KEY.food, start.food);
    this.registry.set(REGISTRY_CAP_KEY.wood, cap.wood);
    this.registry.set(REGISTRY_CAP_KEY.stone, cap.stone);
    this.registry.set(REGISTRY_CAP_KEY.food, cap.food);
    this.registry.set('builtIds', new Set<BuildingId>(['town_hall' as BuildingId]));
    this.registry.set('popCap', 5);
    this.registry.set('pop', this.workers.length);
  }

  private applySnapshot(snap: SaveData): void {
    // 1. Re-paint mapData with the player's painted tiles (water channels +
    //    dirt paths). Lake water was already marked by markLakeWater().
    for (const t of snap.paintedTiles) {
      this.mapData[t.ty][t.tx] = t.tile;
      if (t.tile === TILE.DIRT_PATH) {
        this.tilemapLayer.putTileAt(TILE.DIRT_PATH, t.tx, t.ty);
      }
    }
    this.redrawWater();

    // 2. Buildings — same constructor as default spawn, then restoreFrom.
    for (const b of snap.buildings) {
      const building = new Building(this, b.id, b.tileX, b.tileY);
      if (b.isConstructed) building.markPrebuilt();
      building.restoreFrom({ hp: b.hp, buildProgress: b.buildProgress });
      this.buildings.push(building);
      for (const t of building.footprintTiles()) {
        this.buildingTiles.add(this.tileKey(t.tx, t.ty));
      }
      // Wire the same effects that onBuildingConstructed installs (farm
      // passive food). Houses / Warehouse pop+cap math is reflected in
      // saved popCap / capKey values, so we don't double-apply here.
      if (b.isConstructed && b.id === 'farm') {
        const farmTile = building.interactionTile;
        this.time.addEvent({
          delay: 5000,
          loop: true,
          callback: () => {
            if (building.activeTenders > 0) this.deposit('food', 1, farmTile);
          },
        });
      }
    }

    // 3. Resource nodes.
    for (const n of snap.nodes) {
      const node = new ResourceNode(this, n.kind, n.worldX, n.worldY);
      node.setRemaining(n.remaining);
      this.nodes.push(node);
      this.nodeTiles.add(this.tileKey(node.tileX, node.tileY));
    }

    // 4. Workers.
    const deps = {
      mapWidthTiles: MAP_WIDTH_TILES,
      mapHeightTiles: MAP_HEIGHT_TILES,
      isWalkable: this.isWalkable.bind(this),
      getDropoffTile: this.getDropoffTile.bind(this),
      deposit: this.deposit.bind(this),
      findNearestNode: this.findNearestNode.bind(this),
      findNearestSite: this.findNearestSite.bind(this),
      isBanditNearby: this.isBanditNearby.bind(this),
      getHomeTile: this.getHomeTile.bind(this),
    };
    for (let i = 0; i < snap.workers.length; i++) {
      const w = snap.workers[i];
      const tx = Math.floor(w.worldX / TILE_SIZE);
      const ty = Math.floor(w.worldY / TILE_SIZE);
      const worker = new Worker(i, this, tx, ty, deps);
      worker.restoreFrom(w);
      this.workers.push(worker);
    }

    // 5. Registry — saved values trump initialCap.
    this.registry.set(REGISTRY_KEY.wood, snap.resources.wood);
    this.registry.set(REGISTRY_KEY.stone, snap.resources.stone);
    this.registry.set(REGISTRY_KEY.food, snap.resources.food);
    this.registry.set(REGISTRY_CAP_KEY.wood, snap.resources.woodCap);
    this.registry.set(REGISTRY_CAP_KEY.stone, snap.resources.stoneCap);
    this.registry.set(REGISTRY_CAP_KEY.food, snap.resources.foodCap);
    this.registry.set('builtIds', new Set<BuildingId>(snap.builtIds));
    this.registry.set('popCap', snap.popCap);
    this.registry.set('pop', snap.pop);
  }

  private buildSnapshot(): SaveData {
    // Painted tiles = WATER tiles outside lakes, plus all DIRT_PATH tiles.
    const painted: SavedTile[] = [];
    for (let ty = 0; ty < MAP_HEIGHT_TILES; ty++) {
      for (let tx = 0; tx < MAP_WIDTH_TILES; tx++) {
        const t = this.mapData[ty][tx];
        if (t === TILE.DIRT_PATH) {
          painted.push({ tx, ty, tile: t });
        } else if (t === TILE.WATER) {
          // Skip lake water; it's regenerated from LAKES.
          let inLake = false;
          const cx = (tx + 0.5) * TILE_SIZE;
          const cy = (ty + 0.5) * TILE_SIZE;
          for (const poly of this.lakePolygons) {
            if (this.pointInPolygon(cx, cy, poly)) {
              inLake = true;
              break;
            }
          }
          if (!inLake) painted.push({ tx, ty, tile: t });
        }
      }
    }
    return {
      saveVersion: SAVE_VERSION,
      savedAtMs: Date.now(),
      resources: {
        wood: (this.registry.get(REGISTRY_KEY.wood) as number) ?? 0,
        stone: (this.registry.get(REGISTRY_KEY.stone) as number) ?? 0,
        food: (this.registry.get(REGISTRY_KEY.food) as number) ?? 0,
        woodCap: (this.registry.get(REGISTRY_CAP_KEY.wood) as number) ?? 0,
        stoneCap: (this.registry.get(REGISTRY_CAP_KEY.stone) as number) ?? 0,
        foodCap: (this.registry.get(REGISTRY_CAP_KEY.food) as number) ?? 0,
      },
      pop: (this.registry.get('pop') as number) ?? 0,
      popCap: (this.registry.get('popCap') as number) ?? 0,
      builtIds: Array.from(this.registry.get('builtIds') as Set<BuildingId>),
      buildings: this.buildings.map((b) => b.snapshot()),
      workers: this.workers.map((w) => w.snapshot()),
      nodes: this.nodes.map((n) => n.snapshot()),
      paintedTiles: painted,
    };
  }

  private startAutoSave(): void {
    this.time.addEvent({
      delay: 30_000,
      loop: true,
      callback: () => SaveSystem.save(this.buildSnapshot()),
    });
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

  // Phase 4: AoM-style drop-off — the nearest building that accepts the
  // worker's resource. Town Hall always accepts everything; Lumber Mill /
  // Quarry / Farm / Hunter's Lodge accept their specific kind. Worker calls
  // this when full.
  // §4.3 fleeing detection: any enemy unit within `withinTiles` of the
  // worker. Reuses the unit-side findEnemy with side='player' so we
  // don't duplicate scanning logic.
  private isBanditNearby(fromX: number, fromY: number, withinTiles: number): boolean {
    return this.findEnemy('player', fromX, fromY, withinTiles) !== null;
  }

  // Town Hall south-centre tile — workers run to it when fleeing.
  private getHomeTile(): TileXY {
    const th = BALANCE.townHall;
    return { tx: th.tileX + 1, ty: th.tileY + th.sizeTiles };
  }

  private getDropoffTile(resource: ResourceType, fromX: number, fromY: number): TileXY {
    const candidates = this.dropoffCandidates(resource);
    let best = candidates[0];
    let bestDistSq = Infinity;
    for (const c of candidates) {
      const dx = c.cx - fromX;
      const dy = c.cy - fromY;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        best = c;
        bestDistSq = d2;
      }
    }
    return best.tile;
  }

  private dropoffCandidates(
    resource: ResourceType,
  ): { tile: TileXY; cx: number; cy: number }[] {
    const out: { tile: TileXY; cx: number; cy: number }[] = [];
    // Town Hall is always available (whether modelled as a Building yet or
    // not — we read its placement from BALANCE.townHall directly).
    const th = BALANCE.townHall;
    out.push({
      tile: { tx: th.tileX + 1, ty: th.tileY + th.sizeTiles },
      cx: (th.tileX + th.sizeTiles / 2) * TILE_SIZE,
      cy: (th.tileY + th.sizeTiles) * TILE_SIZE,
    });
    const accepts: Record<ResourceType, BuildingId[]> = {
      wood: ['lumber_mill'],
      stone: ['quarry'],
      food: ['farm', 'hunters_lodge'],
    };
    for (const b of this.buildings) {
      if (!b.isConstructed) continue;
      if (!accepts[resource].includes(b.def.id)) continue;
      const it = b.interactionTile;
      out.push({ tile: it, cx: b.worldX, cy: b.worldY });
    }
    return out;
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

  private deposit(resource: ResourceType, amount: number, atTile: TileXY): number {
    // Apply §4.4 building bonuses based on which dropoff the worker reached.
    // Lumber Mill / Quarry: +50% on wood / stone respectively. Hunter's
    // Lodge: +30% but ONLY on food coming in via animal kills (we proxy this
    // by treating food deposited AT the lodge as animal food). Farm has no
    // deposit bonus — its bonus is the passive +1/5s already wired.
    const dropoffBuilding = this.buildings.find((b) =>
      b.isConstructed &&
      atTile.tx >= b.tileX &&
      atTile.tx < b.tileX + b.def.footprint.w + 1 &&
      atTile.ty >= b.tileY &&
      atTile.ty < b.tileY + b.def.footprint.h + 1,
    );
    let multiplier = 1;
    if (dropoffBuilding) {
      const id = dropoffBuilding.def.id;
      if (resource === 'wood' && id === 'lumber_mill') multiplier = 1.5;
      else if (resource === 'stone' && id === 'quarry') multiplier = 1.5;
      else if (resource === 'food' && id === 'hunters_lodge') multiplier = 1.3;
    }
    const boosted = Math.floor(amount * multiplier);

    const capKey = REGISTRY_CAP_KEY[resource];
    const valKey = REGISTRY_KEY[resource];
    const cap = (this.registry.get(capKey) as number) ?? 0;
    const cur = (this.registry.get(valKey) as number) ?? 0;
    const accepted = Math.min(boosted, Math.max(0, cap - cur));
    this.registry.set(valKey, cur + accepted);
    // Worker's inventory only had `amount` raw; tell it that's all gone.
    return amount;
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
      .setDepth(10000);
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
      .setStrokeStyle(2, 0x80ff80);
    this.placement = { id, ghost, outline };

    // Touch UX: there's no MOVE event between two finger taps, so the ghost
    // would never appear if we waited for it. Snap to the camera centre
    // immediately so the player sees the preview the moment placement starts.
    const cam = this.cameras.main;
    this.updatePlacementPreview(cam.scrollX + cam.width / 2, cam.scrollY + cam.height / 2);

    // Tell UIScene to show a banner: "Placing X — tap to place, × to cancel".
    this.scene.get('UI').events.emit('show-placement-banner', def.name);
  }

  private cancelPlacement(): void {
    if (!this.placement) return;
    this.placement.ghost.destroy();
    this.placement.outline.destroy();
    this.placement = null;
    this.scene.get('UI').events.emit('hide-placement-banner');
  }

  private updatePlacementPreview(worldX: number, worldY: number): void {
    if (!this.placement) return;
    const def = BUILDING_DEFS[this.placement.id];
    const tx = Math.floor(worldX / TILE_SIZE) - Math.floor(def.footprint.w / 2);
    const ty = Math.floor(worldY / TILE_SIZE) - Math.floor(def.footprint.h / 2);
    const ok = this.isPlacementValid(this.placement.id, tx, ty);
    this.placement.ghost
      .setPosition((tx + def.footprint.w / 2) * TILE_SIZE, (ty + def.footprint.h) * TILE_SIZE)
      .setTint(ok ? 0x80ff80 : 0xff8080);
    this.placement.outline
      .setPosition(tx * TILE_SIZE, ty * TILE_SIZE)
      .setFillStyle(ok ? 0x80ff80 : 0xff8080, 0.2)
      .setStrokeStyle(2, ok ? 0x80ff80 : 0xff8080);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.paintMode !== 'off') {
      if (this.painting) this.paintTileAtPointer(pointer);
      return;
    }
    if (!this.placement) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.updatePlacementPreview(world.x, world.y);
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
        // Eden: building must be on FREE grass — not water, not path, not
        // stone, not a tree/rock/bush, not another building.
        if (this.mapData[cy][cx] !== TILE.GRASS) return false;
        const k = this.tileKey(cx, cy);
        if (this.buildingTiles.has(k)) return false;
        if (this.nodeTiles.has(k)) return false;
      }
    }
    if (!this.prereqsMet(id)) return false;
    // Farm exception: must be placed next to water (irrigation).
    if (id === 'farm' && !this.hasAdjacentWater(tx, ty, def.footprint.w, def.footprint.h)) {
      return false;
    }
    return true;
  }

  private hasAdjacentWater(tx: number, ty: number, w: number, h: number): boolean {
    // Check all 4-connected tiles around the footprint perimeter.
    for (let dx = -1; dx <= w; dx++) {
      for (let dy = -1; dy <= h; dy++) {
        const inside = dx >= 0 && dx < w && dy >= 0 && dy < h;
        if (inside) continue;
        const onCorner = (dx === -1 || dx === w) && (dy === -1 || dy === h);
        if (onCorner) continue; // 4-connected only
        const cx = tx + dx;
        const cy = ty + dy;
        if (cx < 0 || cy < 0 || cx >= MAP_WIDTH_TILES || cy >= MAP_HEIGHT_TILES) continue;
        if (this.mapData[cy][cx] === TILE.WATER) return true;
      }
    }
    return false;
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
  }

  private onBuildingConstructed(b: Building): void {
    const built = this.registry.get('builtIds') as Set<BuildingId>;
    built.add(b.def.id);
    this.registry.set('builtIds', built);

    switch (b.def.id) {
      case 'house': {
        const cap = (this.registry.get('popCap') as number) ?? 0;
        this.registry.set('popCap', cap + 3);
        break;
      }
      case 'warehouse': {
        const per = BALANCE.storage.perWarehouse;
        for (const r of ['wood', 'stone', 'food'] as ResourceType[]) {
          const cur = (this.registry.get(REGISTRY_CAP_KEY[r]) as number) ?? 0;
          this.registry.set(REGISTRY_CAP_KEY[r], cur + per[r]);
        }
        break;
      }
      case 'farm': {
        // Eden's spec divergence (logged in §12): farms only produce while
        // a worker is tending them, instead of the spec's passive flow.
        const farmTile = b.interactionTile;
        this.time.addEvent({
          delay: 5000,
          loop: true,
          callback: () => {
            if (b.activeTenders > 0) this.deposit('food', 1, farmTile);
          },
        });
        break;
      }
    }
  }

  // ---------- input -----------------------------------------------------------

  // Paint mode cycles off -> road -> water -> off. While on, no other tap
  // dispatch fires. Toggling clears any in-flight placement / selection.
  private toggleRoadMode(): void {
    const next: Record<typeof this.paintMode, typeof this.paintMode> = {
      off: 'road',
      road: 'water',
      water: 'off',
    };
    this.paintMode = next[this.paintMode];
    if (this.paintMode !== 'off') {
      this.cancelPlacement();
      this.deselectAll();
    } else {
      this.painting = false;
    }
    this.scene.get('UI').events.emit('paint-mode-changed', this.paintMode);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.paintMode !== 'off') {
      if (this.touch.wasGesture) return;
      this.painting = true;
      this.paintTileAtPointer(pointer);
      return;
    }
    if (this.placement) {
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.updatePlacementPreview(world.x, world.y);
    }
  }

  private paintTileAtPointer(pointer: Phaser.Input.Pointer): void {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tx = Math.floor(world.x / TILE_SIZE);
    const ty = Math.floor(world.y / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= MAP_WIDTH_TILES || ty >= MAP_HEIGHT_TILES) return;
    if (this.buildingTiles.has(this.tileKey(tx, ty))) return;
    if (this.nodeTiles.has(this.tileKey(tx, ty))) return;
    const cur = this.mapData[ty][tx];
    let next: number | null = null;
    if (this.paintMode === 'road') {
      // Toggle grass <-> dirt path.
      if (cur === TILE.GRASS) next = TILE.DIRT_PATH;
      else if (cur === TILE.DIRT_PATH) next = TILE.GRASS;
    } else if (this.paintMode === 'water') {
      // Toggle grass <-> water (Eden's "dig channels" feature).
      if (cur === TILE.GRASS) next = TILE.WATER;
      else if (cur === TILE.WATER) next = TILE.GRASS;
    }
    if (next === null) return;
    // Eden's rule: nothing inside water. Reject painting water on a tile
    // a worker or soldier currently stands on — would otherwise leave the
    // unit stranded inside an un-walkable water tile.
    if (next === TILE.WATER) {
      for (const w of this.workers) {
        if (w.tileX === tx && w.tileY === ty) return;
      }
      for (const u of this.units) {
        if (!u.isAlive) continue;
        if (u.tileX === tx && u.tileY === ty) return;
      }
    }
    this.mapData[ty][tx] = next;
    if (next === TILE.WATER || cur === TILE.WATER) {
      // Water flips don't touch the tilemap layer — water is rendered by
      // the unified Graphics layer that scans mapData. Tilemap stays grass.
      this.redrawWater();
    } else {
      this.tilemapLayer.putTileAt(next, tx, ty);
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]): void {
    if (this.paintMode !== 'off') {
      this.painting = false;
      return;
    }
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
      return k === 'worker' || k === 'node' || k === 'building' || k === 'unit';
    });

    // No interactive object under the tap.
    if (!obj) {
      // If a soldier is selected, treat the tap as an attack-move order to
      // the world tile under the pointer.
      if (this.selectedSoldier) {
        const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const tx = Math.floor(world.x / TILE_SIZE);
        const ty = Math.floor(world.y / TILE_SIZE);
        this.selectedSoldier.attackMove({ tx, ty });
        return;
      }
      this.deselectAll();
      return;
    }

    const kind = obj.getData('kind');

    if (kind === 'worker') {
      const w = obj.getData('worker') as Worker;
      this.deselectSoldier();
      this.closeBuildingPanel();
      if (this.selectedWorker === w) {
        this.deselectWorker();
      } else {
        this.deselectWorker();
        this.selectedWorker = w;
        w.setSelected(true);
        this.scene.get('UI').events.emit('open-worker-panel', { worker: w });
      }
      return;
    }

    if (kind === 'unit') {
      const u = obj.getData('unit') as Unit;
      if (u.side === 'player') {
        // Selecting one of our soldiers.
        this.deselectWorker();
        this.closeBuildingPanel();
        if (this.selectedSoldier === u) {
          this.deselectSoldier();
        } else {
          this.deselectSoldier();
          this.selectedSoldier = u;
          u.setSelected(true);
        }
        return;
      }
      // Tapped an enemy: if soldier selected, attack it.
      if (this.selectedSoldier) {
        this.selectedSoldier.attackMove({ tx: u.tileX, ty: u.tileY }, u);
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
      if (this.selectedWorker) {
        if (!b.isConstructed) {
          this.selectedWorker.assignSite(b);
          return;
        }
        // Worker + constructed Farm = tend the farm.
        if (b.def.id === 'farm') {
          this.selectedWorker.assignFarm(b);
          return;
        }
      }
      // Any constructed building opens the unified selection panel.
      if (b.isConstructed) {
        this.openBuildingPanel(b);
        return;
      }
      this.deselectAll();
      return;
    }
  }

  private openBuildingPanel(b: Building): void {
    this.deselectWorker();
    this.deselectSoldier();
    if (this.selectedBarracks && this.selectedBarracks !== b) {
      this.selectedBarracks.setSelected(false);
    }
    this.selectedBarracks = b;
    b.setSelected(true);
    this.scene.get('UI').events.emit('open-building-panel', {
      instanceId: b.instanceId,
      id: b.def.id,
      name: b.def.name,
      hp: b.hp,
      hpMax: b.def.hpMax,
    });
  }

  private closeBuildingPanel(): void {
    if (!this.selectedBarracks) return;
    this.selectedBarracks.setSelected(false);
    this.selectedBarracks = null;
    this.scene.get('UI').events.emit('close-building-panel');
  }

  private deselectWorker(): void {
    if (this.selectedWorker) {
      this.selectedWorker.setSelected(false);
      this.selectedWorker = null;
      this.scene.get('UI').events.emit('close-worker-panel');
    }
  }

  private deselectSoldier(): void {
    if (this.selectedSoldier) {
      this.selectedSoldier.setSelected(false);
      this.selectedSoldier = null;
    }
  }

  private deselectAll(): void {
    this.deselectWorker();
    this.deselectSoldier();
    this.closeBuildingPanel();
  }
}

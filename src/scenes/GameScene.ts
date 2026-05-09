import Phaser from 'phaser';
import { TouchController } from '../input/TouchController';
import {
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  TILE,
  TILE_SIZE,
} from '../data/tiles';
import { BALANCE } from '../data/balance';
import { Tree } from '../entities/Tree';
import { Worker } from '../entities/Worker';
import type { TileXY } from '../utils/pathfinding';

interface MapJson {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  data: number[][];
}

const REGISTRY_WOOD = 'wood';
const REGISTRY_WOOD_CAP = 'woodCap';

export class GameScene extends Phaser.Scene {
  private mapData: number[][] = [];
  private trees: Tree[] = [];
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
    this.spawnTrees();
    this.spawnWorkers();

    // Center on the Town Hall so the player sees their village immediately.
    const th = BALANCE.townHall;
    const thCenterX = (th.tileX + th.sizeTiles / 2) * TILE_SIZE;
    const thCenterY = (th.tileY + th.sizeTiles / 2) * TILE_SIZE;
    this.cameras.main.centerOn(thCenterX, thCenterY);

    // §7.5: zoom range 0.7×–2.0×. Controller self-cleans on scene shutdown.
    this.touch = new TouchController(this, { minZoom: 0.7, maxZoom: 2.0 });

    // Initialise resource counters via the registry so UIScene can listen.
    this.registry.set(REGISTRY_WOOD, BALANCE.startingResources.wood);
    this.registry.set(REGISTRY_WOOD_CAP, BALANCE.storage.initialCap.wood);

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
    // Origin at base so the roof rises above the footprint and the bottom
    // sits exactly on the south edge of the 3×3 tile area.
    this.add
      .sprite(cx, cy + sizePx / 2, 'town-hall')
      .setOrigin(0.5, 1)
      .setDepth(cy + sizePx / 2);
  }

  private spawnTrees(): void {
    // Phase 2: ~5% of grass tiles (lower than spec's 25% for visibility).
    // Skip tiles inside the Town Hall footprint and worker spawn area.
    const occupied = new Set<number>();
    const th = BALANCE.townHall;
    for (let dy = -1; dy <= th.sizeTiles + 1; dy++) {
      for (let dx = -1; dx <= th.sizeTiles + 1; dx++) {
        occupied.add((th.tileY + dy) * 4096 + (th.tileX + dx));
      }
    }
    const rng = Phaser.Math.RND;
    rng.sow(['phase-2-trees']);
    for (let ty = 0; ty < MAP_HEIGHT_TILES; ty++) {
      for (let tx = 0; tx < MAP_WIDTH_TILES; tx++) {
        if (occupied.has(ty * 4096 + tx)) continue;
        if (this.mapData[ty][tx] !== TILE.GRASS) continue;
        if (rng.frac() < 0.05) {
          this.trees.push(new Tree(this, tx, ty));
        }
      }
    }
  }

  private spawnWorkers(): void {
    const th = BALANCE.townHall;
    // Three spawn tiles just south of the Town Hall.
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
      depositWood: this.depositWood.bind(this),
      findNearestTree: this.findNearestTree.bind(this),
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

  // Workers drop wood at the south-center tile of the Town Hall footprint.
  private getDropoffTile(): TileXY {
    const th = BALANCE.townHall;
    return { tx: th.tileX + 1, ty: th.tileY + th.sizeTiles };
  }

  private findNearestTree(fromX: number, fromY: number): Tree | null {
    let best: Tree | null = null;
    let bestDistSq = Infinity;
    for (const t of this.trees) {
      if (!t.isAvailable) continue;
      const dx = t.worldX - fromX;
      const dy = t.worldY - fromY;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        best = t;
        bestDistSq = distSq;
      }
    }
    return best;
  }

  private depositWood(amount: number): number {
    const cap = (this.registry.get(REGISTRY_WOOD_CAP) as number) ?? BALANCE.storage.initialCap.wood;
    const cur = (this.registry.get(REGISTRY_WOOD) as number) ?? 0;
    const accepted = Math.min(amount, Math.max(0, cap - cur));
    this.registry.set(REGISTRY_WOOD, cur + accepted);
    return accepted;
  }

  private onPointerUp(pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]): void {
    // §7.5: tap vs drag. The TouchController already tracks gesture state.
    if (this.touch.wasGesture) return;
    if (pointer.getDistance() > 10) return;

    const obj = currentlyOver.find(
      (o) => o.getData && (o.getData('kind') === 'worker' || o.getData('kind') === 'tree'),
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
    if (kind === 'tree') {
      const tree = obj.getData('tree') as Tree;
      if (this.selectedWorker) {
        this.selectedWorker.assignTree(tree);
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

import type { BuildingId } from '../data/buildings';
import type { NodeKind, ResourceType } from '../data/balance';

// §6.7: localStorage save format. saveVersion is bumped any time a
// breaking change is made to the JSON shape; on load, version mismatch
// triggers discard + warning.
export const SAVE_VERSION = 1 as const;
const SAVE_KEY = 'pocket_kingdom_save_v1';

export interface SavedBuilding {
  id: BuildingId;
  tileX: number;
  tileY: number;
  hp: number;
  isConstructed: boolean;
  buildProgress: number;
}

export interface SavedWorker {
  worldX: number;
  worldY: number;
  autoMode: 'gather' | 'build' | null;
  autoResource: ResourceType | null;
  inventoryAmount: number;
  inventoryResource: ResourceType | null;
}

export interface SavedNode {
  kind: NodeKind;
  worldX: number;
  worldY: number;
  remaining: number;
}

export interface SavedTile {
  tx: number;
  ty: number;
  tile: number;
}

export interface SaveData {
  saveVersion: typeof SAVE_VERSION;
  savedAtMs: number;
  resources: {
    wood: number;
    stone: number;
    food: number;
    woodCap: number;
    stoneCap: number;
    foodCap: number;
  };
  pop: number;
  popCap: number;
  builtIds: BuildingId[];
  buildings: SavedBuilding[];
  workers: SavedWorker[];
  nodes: SavedNode[];
  // Tiles painted by the player (water channels + dirt paths). Pre-existing
  // lake tiles are NOT saved because they're regenerated from LAKES on
  // boot, so we'd double-mark them otherwise.
  paintedTiles: SavedTile[];
}

// Pure module — no constructor needed. GameScene calls these directly.
export const SaveSystem = {
  exists(): boolean {
    try {
      return localStorage.getItem(SAVE_KEY) !== null;
    } catch {
      return false;
    }
  },

  load(): SaveData | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (parsed.saveVersion !== SAVE_VERSION) {
        console.warn(
          `[SaveSystem] discarding incompatible save (version ${parsed.saveVersion}, expected ${SAVE_VERSION})`,
        );
        localStorage.removeItem(SAVE_KEY);
        return null;
      }
      return parsed as SaveData;
    } catch (err) {
      console.warn('[SaveSystem] load failed', err);
      return null;
    }
  },

  save(data: SaveData): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('[SaveSystem] save failed', err);
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  },
};

// Tile indices for the terrain tileset (§4.5).
// The placeholder texture generated in PreloadScene packs these horizontally
// in the same order; real Tiny Swords art will replace it later.
export const TILE = {
  GRASS: 0,
  DIRT_PATH: 1,
  FOREST_FLOOR: 2,
  WATER: 3,
  STONE_GROUND: 4,
  BRIDGE: 5,
} as const;

export type TileId = (typeof TILE)[keyof typeof TILE];

export const TILE_SIZE = 64;
export const MAP_WIDTH_TILES = 40;
export const MAP_HEIGHT_TILES = 60;

export const TILE_COLORS: readonly number[] = [
  0x7ac74f, // grass
  0xa0815a, // dirt_path
  0x4f8e32, // forest_floor
  0x5ba8e0, // water
  0x888888, // stone_ground
  0x7b5c3a, // bridge
];

// Source-of-truth lake placement. mapData.WATER tiles are derived from
// these; the visible water is rendered as smooth Phaser Graphics
// ellipses on top of a grass tilemap so shorelines aren't stair-stepped.
export interface LakeConfig {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}
export const LAKES: readonly LakeConfig[] = [
  { cx: 8, cy: 22, rx: 5, ry: 4 },
  { cx: 32, cy: 14, rx: 4, ry: 3 },
  { cx: 28, cy: 52, rx: 5, ry: 5 },
];

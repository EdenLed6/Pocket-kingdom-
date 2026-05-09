import Phaser from 'phaser';
import { TouchController } from '../input/TouchController';
import { MAP_HEIGHT_TILES, MAP_WIDTH_TILES, TILE_SIZE } from '../data/tiles';

interface MapJson {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  data: number[][];
}

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create(): void {
    const json = this.cache.json.get('main_map') as MapJson | undefined;
    if (!json) {
      throw new Error('main_map JSON not found in cache');
    }

    const map = this.make.tilemap({
      data: json.data,
      tileWidth: json.tileWidth,
      tileHeight: json.tileHeight,
    });

    // The texture key 'terrain' is generated in PreloadScene. For raw-data
    // tilemaps we pass the same string for tilesetName and textureKey.
    const tileset = map.addTilesetImage('terrain', 'terrain', TILE_SIZE, TILE_SIZE, 0, 0);
    if (!tileset) {
      throw new Error('failed to bind terrain tileset');
    }

    const layer = map.createLayer(0, tileset, 0, 0);
    if (!layer) {
      throw new Error('failed to create tilemap layer');
    }

    const worldW = MAP_WIDTH_TILES * TILE_SIZE;
    const worldH = MAP_HEIGHT_TILES * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    // Start centered on the map so the player can pan in any direction.
    this.cameras.main.centerOn(worldW / 2, worldH / 2);

    // §7.5: zoom range 0.7×–2.0×. Controller self-cleans on scene shutdown.
    new TouchController(this, { minZoom: 0.7, maxZoom: 2.0 });
  }
}

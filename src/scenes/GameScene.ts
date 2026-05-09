import Phaser from 'phaser';
import { TouchController } from '../input/TouchController';
import { MAP_HEIGHT_TILES, MAP_WIDTH_TILES, TILE_SIZE } from '../data/tiles';
import { diag } from '../utils/diag';

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
    diag('GameScene.create begin', 'ok');
    const json = this.cache.json.get('main_map') as MapJson | undefined;
    if (!json) {
      diag('main_map JSON not in cache', 'err');
      throw new Error('main_map JSON not found in cache');
    }
    diag(`map json: ${json.width}x${json.height} tiles`, 'ok');

    const map = this.make.tilemap({
      data: json.data,
      tileWidth: json.tileWidth,
      tileHeight: json.tileHeight,
    });
    diag('tilemap created', 'ok');

    const tileset = map.addTilesetImage('terrain', 'terrain', TILE_SIZE, TILE_SIZE, 0, 0);
    if (!tileset) {
      diag('addTilesetImage returned null', 'err');
      throw new Error('failed to bind terrain tileset');
    }
    diag('tileset bound', 'ok');

    const layer = map.createLayer(0, tileset, 0, 0);
    if (!layer) {
      diag('createLayer returned null', 'err');
      throw new Error('failed to create tilemap layer');
    }
    diag('layer created', 'ok');

    const worldW = MAP_WIDTH_TILES * TILE_SIZE;
    const worldH = MAP_HEIGHT_TILES * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.centerOn(worldW / 2, worldH / 2);

    new TouchController(this, { minZoom: 0.7, maxZoom: 2.0 });
    diag('GameScene.create done', 'ok');
  }
}

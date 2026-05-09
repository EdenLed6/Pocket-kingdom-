import Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create(): void {
    // Phase 0: world is just the green clear color from the game config (§3).
    // Tilemap, workers, buildings, etc. are introduced in Phase 1+.
  }
}

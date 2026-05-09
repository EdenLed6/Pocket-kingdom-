import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    // Phase 0: no assets yet. Asset manifest is populated in later phases (§8.3).
  }

  create(): void {
    this.scene.start('Game');
    this.scene.launch('UI');
  }
}

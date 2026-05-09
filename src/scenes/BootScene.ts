import Phaser from 'phaser';
import { diag } from '../utils/diag';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    diag('BootScene.create -> Preload', 'ok');
    this.scene.start('Preload');
  }
}

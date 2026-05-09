import Phaser from 'phaser';

export class UIScene extends Phaser.Scene {
  constructor() {
    super('UI');
  }

  create(): void {
    // Phase 0: confirms the UI scene mounts in parallel with GameScene (§7).
    // Real HUD lands in Phase 2.
    const label = this.add.text(8, 8, 'Pocket Kingdom — Phase 0', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ffffff',
    });
    label.setScrollFactor(0);
  }
}

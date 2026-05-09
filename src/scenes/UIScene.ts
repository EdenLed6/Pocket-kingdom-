import Phaser from 'phaser';

const HUD_FONT = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: '20px',
  color: '#ffffff',
};

export class UIScene extends Phaser.Scene {
  private woodText!: Phaser.GameObjects.Text;

  constructor() {
    super('UI');
  }

  create(): void {
    // Top HUD bar background.
    const w = this.scale.width;
    this.add.rectangle(0, 0, w, 36, 0x000000, 0.55).setOrigin(0, 0).setDepth(1000);

    // Wood counter. Real icons land in Phase 3+ when sprite art is in.
    this.woodText = this.add
      .text(12, 8, this.formatWood(), HUD_FONT)
      .setDepth(1001)
      .setScrollFactor(0);

    this.registry.events.on('changedata', this.onRegistryChange, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.registry.events.off('changedata', this.onRegistryChange, this);
    });
  }

  private onRegistryChange(_parent: unknown, key: string): void {
    if (key === 'wood' || key === 'woodCap') {
      this.woodText.setText(this.formatWood());
    }
  }

  private formatWood(): string {
    const wood = (this.registry.get('wood') as number) ?? 0;
    const cap = (this.registry.get('woodCap') as number) ?? 0;
    return `Wood ${wood} / ${cap}`;
  }
}

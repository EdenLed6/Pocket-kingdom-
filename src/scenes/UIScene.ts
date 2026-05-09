import Phaser from 'phaser';

const HUD_FONT = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: '16px',
  color: '#ffffff',
};

interface ResourceLine {
  key: string;
  capKey: string;
  label: string;
  text: Phaser.GameObjects.Text;
}

export class UIScene extends Phaser.Scene {
  private lines: ResourceLine[] = [];

  constructor() {
    super('UI');
  }

  create(): void {
    const w = this.scale.width;
    this.add.rectangle(0, 0, w, 36, 0x000000, 0.55).setOrigin(0, 0).setDepth(1000);

    const defs: { key: string; capKey: string; label: string }[] = [
      { key: 'wood', capKey: 'woodCap', label: 'W' },
      { key: 'stone', capKey: 'stoneCap', label: 'S' },
      { key: 'food', capKey: 'foodCap', label: 'F' },
    ];

    const colWidth = Math.floor(w / defs.length);
    defs.forEach((d, i) => {
      const text = this.add
        .text(8 + colWidth * i, 8, '', HUD_FONT)
        .setDepth(1001)
        .setScrollFactor(0);
      const line: ResourceLine = { ...d, text };
      this.lines.push(line);
      this.refreshLine(line);
    });

    this.registry.events.on('changedata', this.onRegistryChange, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.registry.events.off('changedata', this.onRegistryChange, this);
    });
  }

  private onRegistryChange(_parent: unknown, key: string): void {
    for (const line of this.lines) {
      if (key === line.key || key === line.capKey) {
        this.refreshLine(line);
      }
    }
  }

  private refreshLine(line: ResourceLine): void {
    const value = (this.registry.get(line.key) as number) ?? 0;
    const cap = (this.registry.get(line.capKey) as number) ?? 0;
    line.text.setText(`${line.label} ${value}/${cap}`);
  }
}
